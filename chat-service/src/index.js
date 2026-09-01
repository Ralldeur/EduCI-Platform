import "dotenv/config";
import crypto from "node:crypto";
import express from "express";
import { pool, initSchema } from "./db.js";
import { searchRag } from "./ragClient.js";
import { buildSystemPrompt, docTypeForMode } from "./promptBuilder.js";
import { streamAIResponse, generateJSON } from "./groqClient.js";
import { buildCurriculumContext, getCycle, IVORIAN_EXAMS } from "./curriculum.js";

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

// Traduit un échec d'appel Groq en réponse HTTP adaptée. PROMPT_TOO_LARGE
// (voir computeMaxTokens dans groqClient.js) signifie que le prompt à
// envoyer est déjà trop volumineux pour le budget TPM restant, même avec
// le plancher minimum de tokens de réponse — ça arrive sur une
// conversation avec beaucoup d'historique, pas un simple souci de
// disponibilité de l'IA, donc on le distingue avec un message actionnable
// plutôt que le générique "IA indisponible".
function sendGroqError(res, err, context) {
  console.error(`[chat-service] échec ${context}:`, err.message);
  if (err.code === "PROMPT_TOO_LARGE") {
    return res.status(413).json({
      error: "Cette conversation est trop longue pour l'IA — démarrez une nouvelle conversation ou réduisez le contexte.",
    });
  }
  return res.status(502).json({ error: "IA indisponible pour le moment" });
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
    return sendGroqError(res, err, "appel Groq");
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
      const finishReason = chunk.choices[0]?.finish_reason;
      if (finishReason) {
        console.log(
          "[chat-service] fin du stream Groq:",
          "finish_reason=", finishReason,
          "usage=", JSON.stringify(chunk.x_groq?.usage ?? chunk.usage ?? null)
        );
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

// --- Exercices ---------------------------------------------------------
// Génération/correction ponctuelle, sans lien avec une conversation ni
// sauvegarde en base (comme dans le monolithe d'origine). Réponse JSON
// complète (non-streaming), contrairement à /chat.

const EXERCISE_TYPE_INSTRUCTIONS = {
  QCM: "Questions à choix multiples avec 4 options (A, B, C, D). Indique la bonne réponse.",
  OPEN: "Questions ouvertes nécessitant une réponse détaillée.",
  TRUE_FALSE: "Questions Vrai/Faux avec justification.",
  FILL_BLANK: "Phrases à compléter avec les mots manquants.",
};

app.post("/exercises/generate", async (req, res) => {
  const { userId } = identity(req);
  if (!userId) return res.status(401).json({ error: "Non authentifié" });

  const { subject, gradeLevel, serie, topic, difficulty, type, count } = req.body || {};
  if (!subject || !gradeLevel) {
    return res.status(400).json({ error: "Matière et niveau requis" });
  }

  // RAG : contexte d'exercices déjà ingérés pertinents pour le sujet demandé
  // (docType "exercice" imposé, cohérent avec docTypeForMode côté /chat).
  const ragResults = await searchRag(topic || subject, {
    subject,
    gradeLevel,
    docType: "exercice",
    topK: 3,
  });
  const ragBlock =
    ragResults.length > 0
      ? `\n\nExtraits d'exercices déjà disponibles pour t'inspirer :\n${ragResults
          .map((r) => `- ${r.title}: ${r.text.substring(0, 300)}`)
          .join("\n")}`
      : "";

  const curriculumBlock = buildCurriculumContext(gradeLevel, subject, serie);
  const exam = IVORIAN_EXAMS[getCycle(gradeLevel)];
  const typeInstruction = EXERCISE_TYPE_INSTRUCTIONS[type ?? "OPEN"] ?? EXERCISE_TYPE_INSTRUCTIONS.OPEN;
  const exerciseCount = count ?? 3;

  const sharedContext = `Génère ${exerciseCount} exercices de ${subject} pour un élève de ${gradeLevel} en Côte d'Ivoire.
${topic ? `Sujet spécifique : ${topic}` : ""}
Difficulté : ${difficulty ?? "MEDIUM"}
Type : ${typeInstruction}

=== PROGRAMME OFFICIEL IVOIRIEN (respecte-le strictement) ===
${curriculumBlock}
=== FIN DU PROGRAMME ===

Contraintes :
- Reste STRICTEMENT dans le programme ivoirien ci-dessus pour ce niveau (pas de notions hors-programme).
- Ancre les énoncés dans le contexte ivoirien (FCFA, villes ivoiriennes, cacao/café, prénoms locaux) ; n'utilise jamais l'euro ni le dollar.
- Inspire-toi du format de l'examen national : ${exam.name} (${exam.full}).${ragBlock}`;

  // --- Étape 1/2 : vérification silencieuse des paramètres numériques ---
  // Appel court en sortie visible (juste les paramètres validés en JSON
  // compact), mais avec reasoning_effort "default". maxTokens: 100000 est
  // délibérément surdimensionné — computeMaxTokens() (groqClient.js) le
  // ramène de toute façon à tout ce qu'il reste de budget TPM après le
  // prompt, ce qui donne au raisonnement caché la place maximale possible
  // pour vérifier/ajuster les valeurs (ex. équation f(x)=0 avec solution
  // simple) sans risquer de le couper avant qu'il produise le JSON final
  // (observé avec un plafond de 4000 : le raisonnement consommait tout le
  // budget et la génération échouait avec failed_generation vide).
  // Le prompt liste des étapes de calcul explicites (pas juste "vérifie en
  // interne") car un modèle peut "penser" avoir vérifié sans avoir réellement
  // recalculé — il choisit des paramètres qui ONT L'AIR cohérents sans que le
  // calcul soit fait, et l'étape 2 ("ne les remets pas en question") propage
  // l'erreur sans jamais la détecter (cas observé : étude de fonction où la
  // valeur annoncée dans l'énoncé ne correspondait pas à la vraie image par
  // la fonction proposée). D'où l'exigence d'un calcul explicite valeur par
  // valeur, comparé à ce qui sera annoncé, avant de renvoyer le JSON.
  const verifyPrompt = `${sharedContext}

Tâche : NE RÉDIGE AUCUN énoncé. Pour chacun des ${exerciseCount} exercices à venir :
1. Choisis la fonction/l'équation et les paramètres numériques (coefficients, bornes, etc.) adaptés au niveau ${gradeLevel}.
2. Liste les valeurs clés que l'énoncé va annoncer à l'élève (ex. image d'un point par la fonction, racine d'une équation, limite, résultat d'un calcul).
3. Calcule explicitement chacune de ces valeurs à partir des paramètres choisis (ex. remplace x par chaque valeur dans l'expression de f(x) et effectue le calcul complet jusqu'au résultat final).
4. Compare chaque résultat obtenu à l'étape 3 à ce que tu comptes annoncer dans l'énoncé. S'il y a le moindre écart, corrige les paramètres et RECOMMENCE le calcul depuis l'étape 3 — ne passe à l'exercice suivant qu'une fois chaque valeur confirmée exacte.
5. Privilégie des résultats exacts et simples (entier ou fraction simple) adaptés au niveau ${gradeLevel}.

Ce raisonnement (étapes 1 à 4) doit rester interne — n'expose jamais le détail des calculs dans le JSON final, seulement les résultats.

Réponds UNIQUEMENT avec ce JSON compact (pas d'énoncé rédigé, pas d'explication) :
{
  "plans": [
    {
      "idea": "angle/sujet précis de l'exercice",
      "params": "paramètres numériques validés (équation, valeurs, résultat attendu)",
      "verification": { "expression calculée (ex. f(2))": "valeur exacte obtenue au calcul" }
    }
  ]
}
Le champ "verification" doit contenir CHAQUE valeur calculée à l'étape 3, avec exactement la même valeur que celle qui apparaîtra dans l'énoncé final — ces valeurs serviront de référence pour l'étape de rédaction.`;

  let rawPlans;
  try {
    rawPlans = await generateJSON(
      [
        {
          role: "system",
          content:
            "Tu prépares en silence les paramètres numériques d'exercices pour le programme scolaire ivoirien. Réponds uniquement en JSON compact, sans énoncé rédigé.",
        },
        { role: "user", content: verifyPrompt },
      ],
      { maxTokens: 100000, reasoningEffort: "default" }
    );
  } catch (err) {
    return sendGroqError(res, err, "vérification paramètres exercices");
  }

  // Best-effort : si l'étape de vérification ne renvoie pas un JSON
  // exploitable, on continue sans paramètres pré-validés plutôt que
  // d'échouer toute la requête — l'étape de rédaction reste fonctionnelle,
  // juste sans le bénéfice de la vérification silencieuse.
  let plans = [];
  try {
    plans = JSON.parse(rawPlans)?.plans ?? [];
  } catch (err) {
    console.error("[chat-service] réponse IA non-JSON pour la vérification exercices:", rawPlans);
  }

  // --- Étape 2/2 : rédaction finale à partir des paramètres validés ---
  // reasoning_effort "none" : plus besoin de re-vérifier la cohérence
  // numérique (déjà fait à l'étape 1), tout le budget va à la sortie
  // visible — appel rapide et prévisible.
  // On répercute les valeurs de "verification" (étape 1) dans le prompt de
  // rédaction : elles ancrent explicitement les chiffres que l'énoncé et la
  // correction doivent annoncer, plutôt que de laisser l'étape 2 les
  // redéduire (et potentiellement diverger) à partir de "params" seul.
  const plansBlock =
    plans.length > 0
      ? `\n\nParamètres déjà vérifiés à utiliser tels quels (ne les recalcule pas) :\n${plans
          .map((p, i) => {
            const verif =
              p.verification && typeof p.verification === "object" && !Array.isArray(p.verification)
                ? ` [valeurs vérifiées à annoncer telles quelles : ${Object.entries(p.verification)
                    .map(([k, v]) => `${k} = ${v}`)
                    .join(", ")}]`
                : "";
            return `${i + 1}. ${p.idea} — ${p.params}${verif}`;
          })
          .join("\n")}`
      : "";

  const draftPrompt = `${sharedContext}${plansBlock}

Rédige maintenant les ${exerciseCount} exercices complets (énoncé + réponse + explication) à partir des paramètres ci-dessus déjà validés — ne les remets pas en question, contente-toi de rédiger proprement.
Pour tout calcul annexe non couvert par ces paramètres (limite, dérivée, signe, etc.), rédige-le directement, sans hésitation ni retour en arrière visible : jamais de mots ou tournures comme « attends », « en fait », « non, mieux », « réexaminons », « pour simplifier », ou toute autre trace de tâtonnement. La correction doit se lire comme si elle avait été juste du premier coup.

Réponds en JSON avec le format suivant :
{
  "exercises": [
    {
      "question": "...",
      "answer": "...",
      "explanation": "...",
      "options": ["A) ...", "B) ...", "C) ...", "D) ..."]
    }
  ]
}
(le champ "options" n'est nécessaire que pour le type QCM ; omets-le sinon)`;

  let raw;
  try {
    raw = await generateJSON(
      [
        {
          role: "system",
          content: "Tu es un générateur d'exercices pour le programme scolaire ivoirien. Réponds uniquement en JSON valide.",
        },
        { role: "user", content: draftPrompt },
      ],
      { maxTokens: 6000, reasoningEffort: "none" }
    );
  } catch (err) {
    return sendGroqError(res, err, "génération exercices");
  }

  try {
    const exercises = JSON.parse(raw);
    res.json(exercises);
  } catch (err) {
    console.error("[chat-service] réponse IA non-JSON pour exercises/generate:", raw);
    res.status(502).json({ error: "Réponse invalide de l'IA" });
  }
});

app.post("/exercises/correct", async (req, res) => {
  const { userId } = identity(req);
  if (!userId) return res.status(401).json({ error: "Non authentifié" });

  const { question, studentAnswer, correctAnswer, subject, gradeLevel } = req.body || {};
  if (!question || !studentAnswer) {
    return res.status(400).json({ error: "Question et réponse de l'élève requises" });
  }

  const sharedContext = `Niveau : ${gradeLevel ?? "niveau non précisé"}
Matière : ${subject ?? "matière non précisée"}

Question : ${question}
${correctAnswer ? `Réponse attendue : ${correctAnswer}` : ""}
Réponse de l'élève : ${studentAnswer}`;

  // --- Étape 1/2 : vérification silencieuse de la note et du calcul ---
  // Même logique que pour /exercises/generate (voir plus haut) : sortie
  // visible courte attendue, mais reasoning_effort "default" et un budget
  // max_tokens généreux pour laisser au raisonnement caché la place de
  // vérifier/recalculer la méthode correcte avant de trancher la note.
  const verifyPrompt = `${sharedContext}

Tâche : NE RÉDIGE PAS le feedback complet. Détermine et VÉRIFIE en interne la note exacte sur 20 selon le barème ivoirien (APC), ainsi que le résultat/la méthode corrects étape par étape si un calcul ou une résolution est en jeu. Si un premier calcul te semble incohérent, recorrige-le en interne avant de répondre — sans que cette étape n'apparaisse nulle part.

Réponds UNIQUEMENT avec ce JSON compact (pas de rédaction complète) :
{
  "score": 15,
  "keyFacts": "résultat/méthode corrects validés, et liste brève des erreurs précises de l'élève à mentionner"
}`;

  let rawVerification;
  try {
    rawVerification = await generateJSON(
      [
        {
          role: "system",
          content:
            "Tu prépares en silence l'évaluation d'une copie d'élève ivoirien (programme MENA/DPFC, APC). Réponds uniquement en JSON compact, sans rédaction complète.",
        },
        { role: "user", content: verifyPrompt },
      ],
      { maxTokens: 100000, reasoningEffort: "default" }
    );
  } catch (err) {
    return sendGroqError(res, err, "vérification correction exercice");
  }

  // Best-effort, comme pour /exercises/generate : une vérification non
  // exploitable ne bloque pas la rédaction du feedback, juste sans le
  // bénéfice de la note/méthode déjà validées.
  let verification = {};
  try {
    verification = JSON.parse(rawVerification) ?? {};
  } catch (err) {
    console.error("[chat-service] réponse IA non-JSON pour la vérification correction:", rawVerification);
  }

  // --- Étape 2/2 : rédaction finale du feedback ---
  // reasoning_effort "none" : la note et la méthode sont déjà validées à
  // l'étape 1, il ne reste qu'à rédiger proprement.
  const verificationBlock =
    verification.score != null || verification.keyFacts
      ? `\n\nÉvaluation déjà vérifiée à utiliser telle quelle (ne la recalcule pas) :\n- Note validée : ${verification.score ?? "?"}/20\n- Éléments validés : ${verification.keyFacts ?? "aucun"}`
      : "";

  const draftPrompt = `${sharedContext}${verificationBlock}

Rédige maintenant le feedback complet à partir de l'évaluation ci-dessus déjà validée — ne la remets pas en question, contente-toi de rédiger proprement :
1. La note sur 20 (déjà validée ci-dessus)
2. Les points positifs
3. Les erreurs identifiées
4. La correction détaillée étape par étape
5. Des conseils pour s'améliorer

Pour tout calcul annexe de la correction non couvert par l'évaluation ci-dessus, rédige-le directement, sans hésitation ni retour en arrière visible : jamais de mots ou tournures comme « attends », « en fait », « non, mieux », « réexaminons », « pour simplifier », ou toute autre trace de tâtonnement. La correction doit se lire comme si elle avait été juste du premier coup.

Réponds en JSON avec le format :
{
  "score": 15,
  "feedback": "...",
  "positives": ["..."],
  "errors": ["..."],
  "correction": "...",
  "tips": ["..."]
}`;

  let raw;
  try {
    raw = await generateJSON(
      [
        {
          role: "system",
          content:
            "Tu es un correcteur pédagogique bienveillant pour le programme scolaire ivoirien (MENA/DPFC, Approche Par les Compétences). Note sur 20 selon le barème ivoirien, emploie le vocabulaire APC et des exemples ancrés en Côte d'Ivoire (FCFA, villes ivoiriennes). Réponds uniquement en JSON valide.",
        },
        { role: "user", content: draftPrompt },
      ],
      { temperature: 0.5, maxTokens: 6000, reasoningEffort: "none" }
    );
  } catch (err) {
    return sendGroqError(res, err, "correction exercice");
  }

  try {
    const correction = JSON.parse(raw);
    res.json(correction);
  } catch (err) {
    console.error("[chat-service] réponse IA non-JSON pour exercises/correct:", raw);
    res.status(502).json({ error: "Réponse invalide de l'IA" });
  }
});

// --- Admin --------------------------------------------------------------
// Pas de vérification ROLE_ADMIN ici : comme pour le reste des routes de
// chat-service, l'autorisation est décidée en amont par le frontend (voir
// frontend/src/lib/auth.ts::requireAdmin) avant même d'appeler le gateway —
// même convention que /conversations (qui ne vérifie pas non plus de rôle,
// seulement l'identité via x-user-id).

app.get("/admin/stats", async (_req, res) => {
  const [conversations, messages] = await Promise.all([
    pool.query("SELECT COUNT(*)::int AS count FROM chat_conversations"),
    pool.query("SELECT COUNT(*)::int AS count FROM chat_messages"),
  ]);

  res.json({
    totalConversations: conversations.rows[0].count,
    totalMessages: messages.rows[0].count,
  });
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
