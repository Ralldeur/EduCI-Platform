import "dotenv/config";
import crypto from "node:crypto";
import express from "express";
import { pool, initSchema } from "./db.js";
import { searchRag } from "./ragClient.js";
import { buildSystemPrompt, docTypeForMode } from "./promptBuilder.js";
import { streamAIResponse } from "./groqClient.js";

const app = express();
const PORT = process.env.PORT || 8082;

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "UP" });
});

// Le gateway a déjà validé le JWT et injecté ces headers (voir gateway/src/auth.js).
function identity(req) {
  return { userId: req.headers["x-user-id"] };
}

// --- Conversations ---------------------------------------------------

app.post("/conversations", async (req, res) => {
  const { userId } = identity(req);
  if (!userId) return res.status(401).json({ error: "Non authentifié" });

  const { subject, gradeLevel, serie, mode = "CHAT" } = req.body || {};
  const id = crypto.randomUUID();

  const result = await pool.query(
    `INSERT INTO chat_conversations (id, user_id, subject, grade_level, serie, mode)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [id, userId, subject ?? null, gradeLevel ?? null, serie ?? null, mode]
  );

  res.status(201).json(result.rows[0]);
});

// Liste des conversations de l'utilisateur, plus récentes en premier
// (pour la sidebar du frontend). Inclut le nombre de messages par
// conversation, comme le faisait l'ancien monolithe (_count.messages).
app.get("/conversations", async (req, res) => {
  const { userId } = identity(req);
  if (!userId) return res.status(401).json({ error: "Non authentifié" });

  const result = await pool.query(
    `SELECT c.*, COUNT(m.id)::int AS message_count
     FROM chat_conversations c
     LEFT JOIN chat_messages m ON m.conversation_id = c.id
     WHERE c.user_id = $1
     GROUP BY c.id
     ORDER BY c.updated_at DESC`,
    [userId]
  );

  res.json(result.rows);
});

// Détail d'une conversation avec son historique complet de messages
// (pour afficher le fil de discussion quand on clique dessus dans la sidebar).
app.get("/conversations/:id", async (req, res) => {
  const { userId } = identity(req);
  if (!userId) return res.status(401).json({ error: "Non authentifié" });

  const convResult = await pool.query(
    "SELECT * FROM chat_conversations WHERE id = $1 AND user_id = $2",
    [req.params.id, userId]
  );
  const conversation = convResult.rows[0];
  if (!conversation) {
    return res.status(404).json({ error: "Conversation introuvable" });
  }

  const messagesResult = await pool.query(
    "SELECT id, role, content, created_at FROM chat_messages WHERE conversation_id = $1 ORDER BY created_at ASC",
    [req.params.id]
  );

  res.json({ ...conversation, messages: messagesResult.rows });
});

// Mise à jour partielle d'une conversation (utilisé par ModeSelector côté
// frontend quand l'élève change la matière/le niveau/la série/le mode en
// cours de discussion).
app.patch("/conversations/:id", async (req, res) => {
  const { userId } = identity(req);
  if (!userId) return res.status(401).json({ error: "Non authentifié" });

  const allowedFields = { subject: "subject", gradeLevel: "grade_level", serie: "serie", mode: "mode", title: "title" };
  const updates = [];
  const values = [];
  let i = 1;

  for (const [bodyKey, column] of Object.entries(allowedFields)) {
    if (req.body && Object.prototype.hasOwnProperty.call(req.body, bodyKey)) {
      updates.push(`${column} = $${i}`);
      values.push(req.body[bodyKey]);
      i++;
    }
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: "Aucun champ à mettre à jour" });
  }

  values.push(req.params.id, userId);
  const result = await pool.query(
    `UPDATE chat_conversations SET ${updates.join(", ")}, updated_at = now()
     WHERE id = $${i} AND user_id = $${i + 1}
     RETURNING *`,
    values
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: "Conversation introuvable" });
  }

  res.json(result.rows[0]);
});

// --- Chat --------------------------------------------------------------

app.post("/chat", async (req, res) => {
  const { userId } = identity(req);
  if (!userId) return res.status(401).json({ error: "Non authentifié" });

  const { conversationId, message } = req.body || {};
  if (!conversationId || !message) {
    return res.status(400).json({ error: "conversationId et message sont requis" });
  }

  // 1. Charger la conversation (et vérifier qu'elle appartient bien à l'utilisateur)
  const convResult = await pool.query(
    "SELECT * FROM chat_conversations WHERE id = $1 AND user_id = $2",
    [conversationId, userId]
  );
  const conversation = convResult.rows[0];
  if (!conversation) {
    return res.status(404).json({ error: "Conversation introuvable" });
  }

  // 2. Charger les 20 derniers messages pour l'historique
  const historyResult = await pool.query(
    `SELECT role, content FROM chat_messages
     WHERE conversation_id = $1
     ORDER BY created_at ASC
     LIMIT 20`,
    [conversationId]
  );
  const history = historyResult.rows;

  // 3. RAG : chercher du contexte pertinent, avec docType dérivé du mode
  //    (voir promptBuilder.js — jamais de mélange cours/exercices).
  const ragResults = await searchRag(message, {
    subject: conversation.subject,
    gradeLevel: conversation.grade_level,
    docType: docTypeForMode(conversation.mode),
    topK: 3,
  });

  // 4. Sauvegarder le message de l'élève
  await pool.query(
    "INSERT INTO chat_messages (id, conversation_id, role, content) VALUES ($1, $2, 'user', $3)",
    [crypto.randomUUID(), conversationId, message]
  );

  // 5. Construire le prompt et streamer la réponse
  const systemPrompt = buildSystemPrompt({
    gradeLevel: conversation.grade_level,
    subject: conversation.subject,
    mode: conversation.mode,
    serie: conversation.serie,
    ragResults,
  });

  const chatMessages = [
    { role: "system", content: systemPrompt },
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: message },
  ];

  let stream;
  try {
    stream = await streamAIResponse(chatMessages);
  } catch (err) {
    console.error("[chat-service] échec appel Groq:", err.message);
    return res.status(502).json({ error: "IA indisponible pour le moment" });
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  let fullResponse = "";
  try {
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content ?? "";
      if (content) {
        fullResponse += content;
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }

    const assistantMessageId = crypto.randomUUID();
    await pool.query(
      "INSERT INTO chat_messages (id, conversation_id, role, content) VALUES ($1, $2, 'assistant', $3)",
      [assistantMessageId, conversationId, fullResponse]
    );

    if (history.length === 0) {
      await pool.query(
        "UPDATE chat_conversations SET title = $1, updated_at = now() WHERE id = $2",
        [message.substring(0, 50), conversationId]
      );
    }

    res.write(`data: ${JSON.stringify({ done: true, messageId: assistantMessageId })}\n\n`);
    res.end();
  } catch (err) {
    console.error("[chat-service] erreur pendant le stream:", err);
    res.end();
  }
});

initSchema()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`[chat-service] listening on :${PORT}`);
    });
  })
  .catch((err) => {
    console.error("[chat-service] échec init schema:", err);
    process.exit(1);
  });
