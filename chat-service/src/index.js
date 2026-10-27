import "dotenv/config";
import crypto from "node:crypto";
import express from "express";
import { pool, initSchema } from "./db.js";
import { searchRag } from "./ragClient.js";
import { buildSystemPrompt, docTypeForMode } from "./promptBuilder.js";
import { streamAIResponse, generateJSON } from "./groqClient.js";
import { buildCurriculumContext, getCycle, IVORIAN_EXAMS } from "./curriculum.js";
import { verifyChecks } from "./mathCheck.js";
import { formatRationalDecomposition, normalizeCorrection, normalizeExercises } from "./exerciseText.js";

const app = express();
const PORT = process.env.PORT || 8082;

// Limite par défaut d'Express (100kb) beaucoup trop basse depuis l'ajout de
// la fonctionnalité photo (élève qui joint une image de son travail
// manuscrit à /chat ou /exercises/correct, encodée en base64 dans le corps
// JSON) — voir compressImageFile côté frontend, qui vise ~1-2 Mo par photo
// après compression (le base64 gonfle ça d'environ 33%). 15mb laisse une
// marge confortable au-dessus de ça tout en restant sous la limite Groq de
// 20 Mo par image.
app.use(express.json({ limit: "15mb" }));
// Sans ce handler, un corps trop volumineux malgré tout (photo non
// compressée, bug côté client) remonterait une erreur Express brute
// (HTML/stack) au lieu d'un JSON exploitable par le frontend.
app.use((err, _req, res, next) => {
  if (err?.type === "entity.too.large") {
    return res.status(413).json({ error: "Photo trop volumineuse — réessaie avec une photo plus légère." });
  }
  next(err);
});

app.get("/health", (_req, res) => {
  res.json({ status: "UP" });
});

// Le gateway a déjà validé le JWT et injecté ces headers (voir gateway/src/auth.js).
// x-user-firstname est encodé en URI côté gateway (accents interdits dans un
// header HTTP brut) — on le décode symétriquement ici ; absent/vide -> null,
// laissant buildSystemPrompt (promptBuilder.js) retomber sur une formulation
// générique plutôt que de s'adresser à l'élève par un prénom vide.
function identity(req) {
  const rawFirstName = req.headers["x-user-firstname"];
  let firstName = null;
  if (rawFirstName) {
    try {
      const decoded = decodeURIComponent(rawFirstName);
      firstName = decoded.trim() || null;
    } catch {
      firstName = null;
    }
  }
  return { userId: req.headers["x-user-id"], firstName };
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

// Nombre de messages renvoyés par page (le plus récent d'abord). Une
// conversation peut accumuler plusieurs milliers de messages ; en charger
// l'historique complet d'un coup rend la page inutilisable (DOM énorme,
// 10-15s de chargement) — voir audit perf.
const MESSAGE_PAGE_SIZE = 50;

// Charge une page de messages d'une conversation, du plus récent au plus
// ancien, avec pagination "cursor" vers l'arrière via `before` (ISO
// timestamp du message le plus ancien déjà chargé côté client — voir
// ChatMessage.createdAt). Réutilisée par GET /conversations/:id et
// GET /admin/conversations/:id, seule la vérification de propriétaire diffère
// entre les deux routes.
//
// On sur-fetch d'une ligne (LIMIT + 1) pour déterminer hasMore sans requête
// supplémentaire ; `total` reste utile côté frontend même si hasMore suffit
// à afficher/masquer le bouton "charger plus".
async function fetchMessagesPage(conversationId, before) {
  const params = [conversationId];
  let beforeClause = "";
  if (before) {
    params.push(before);
    beforeClause = `AND created_at < $${params.length}`;
  }
  params.push(MESSAGE_PAGE_SIZE + 1);

  const [messagesResult, totalResult] = await Promise.all([
    pool.query(
      `SELECT id, role, content, created_at FROM chat_messages
       WHERE conversation_id = $1 ${beforeClause}
       ORDER BY created_at DESC
       LIMIT $${params.length}`,
      params
    ),
    pool.query(
      "SELECT COUNT(*)::int AS count FROM chat_messages WHERE conversation_id = $1",
      [conversationId]
    ),
  ]);

  const hasMore = messagesResult.rows.length > MESSAGE_PAGE_SIZE;
  const page = (hasMore ? messagesResult.rows.slice(0, MESSAGE_PAGE_SIZE) : messagesResult.rows).reverse();

  return { messages: page, hasMore, total: totalResult.rows[0].count };
}

// `before` doit être un timestamp ISO exploitable par Postgres ; une valeur
// absente ou invalide est ignorée (première page) plutôt que de faire
// planter la requête sur un paramètre malformé.
function parseBeforeParam(req) {
  const { before } = req.query;
  if (typeof before !== "string" || before.length === 0 || Number.isNaN(Date.parse(before))) {
    return undefined;
  }
  return before;
}

// Détail d'une conversation avec une page de son historique de messages
// (les plus récents par défaut — voir fetchMessagesPage ci-dessus) pour
// afficher le fil de discussion quand on clique dessus dans la sidebar.
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

  const { messages, hasMore, total } = await fetchMessagesPage(req.params.id, parseBeforeParam(req));

  res.json({ ...conversation, messages, hasMore, totalMessages: total });
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

// Suppression d'une conversation (et de ses messages, via ON DELETE CASCADE
// sur chat_messages.conversation_id — voir db.js). Réservée au propriétaire
// de la conversation, comme GET/PATCH ci-dessus.
app.delete("/conversations/:id", async (req, res) => {
  const { userId } = identity(req);
  if (!userId) return res.status(401).json({ error: "Non authentifié" });

  const result = await pool.query(
    "DELETE FROM chat_conversations WHERE id = $1 AND user_id = $2 RETURNING id",
    [req.params.id, userId]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: "Conversation introuvable" });
  }

  res.status(204).end();
});

// --- Chat --------------------------------------------------------------

app.post("/chat", async (req, res) => {
  const { userId, firstName } = identity(req);
  if (!userId) return res.status(401).json({ error: "Non authentifié" });

  // `image` : data URL base64 (ex. "data:image/jpeg;base64,...") d'une photo
  // jointe par l'élève (voir ChatInput.tsx côté frontend, compressée
  // client-side avant envoi) — optionnelle, et peut accompagner ou remplacer
  // `message` (photo seule, sans légende tapée).
  const { conversationId, message, image } = req.body || {};
  if (!conversationId || (!message && !image)) {
    return res.status(400).json({ error: "conversationId et (message ou photo) sont requis" });
  }
  // Contenu réellement persisté en base et utilisé pour le titre de la
  // conversation — jamais vide même en mode "photo seule", et surtout : on
  // ne stocke JAMAIS l'image elle-même en base (colonne `content` en TEXT,
  // et on veut éviter de faire gonfler chat_messages avec du base64 — voir
  // db.js). La photo ne sert qu'à cet unique appel Groq ; l'historique ne
  // garde qu'une trace textuelle de son existence, la réponse de l'IA
  // (qui commence par la transcrire, voir promptBuilder.js) faisant ensuite
  // foi pour toute relecture ultérieure de la conversation.
  const savedContent = message || "📷 Photo envoyée pour analyse.";

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
  //    (voir promptBuilder.js — jamais de mélange cours/exercices). Sans
  //    texte (photo seule, pas de légende), il n'y a rien de pertinent à
  //    interroger — chercher sur une chaîne vide renverrait un contexte
  //    non pertinent au hasard plutôt qu'utile.
  const ragResults = message
    ? await searchRag(message, {
        subject: conversation.subject,
        gradeLevel: conversation.grade_level,
        docType: docTypeForMode(conversation.mode),
        topK: 3,
      })
    : [];

  // 4. Sauvegarder le message de l'élève (jamais l'image elle-même, voir
  //    savedContent plus haut)
  await pool.query(
    "INSERT INTO chat_messages (id, conversation_id, role, content) VALUES ($1, $2, 'user', $3)",
    [crypto.randomUUID(), conversationId, savedContent]
  );

  // 5. Construire le prompt et streamer la réponse
  const systemPrompt = buildSystemPrompt({
    gradeLevel: conversation.grade_level,
    subject: conversation.subject,
    mode: conversation.mode,
    serie: conversation.serie,
    firstName,
    ragResults,
    hasImage: Boolean(image),
  });

  // Contenu du tour utilisateur envoyé à Groq : un tableau multimodal
  // (texte + image) façon OpenAI/Groq si une photo est jointe, sinon le
  // texte brut comme avant — voir estimateTokens (groqClient.js), qui gère
  // les deux formes pour le calcul du budget TPM.
  const userContent = image
    ? [
        { type: "text", text: message || "Voici une photo de mon exercice, peux-tu m'aider ?" },
        { type: "image_url", image_url: { url: image } },
      ]
    : message;

  const chatMessages = [
    { role: "system", content: systemPrompt },
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: userContent },
  ];

  // Les modes QUIZ et EXERCISE produisent souvent des réponses longues et
  // structurées. Avec le plafond par défaut de 6000, le raisonnement caché
  // peut en consommer une grande partie et couper le corrigé visible
  // (finish_reason "length", observé pendant les tests du mode EXERCISE).
  // Comme pour /exercises/generate et /exercises/correct, on demande un
  // plafond haut ; computeMaxTokens() le ramène au budget TPM réellement
  // disponible et au maximum accepté par le modèle.
  const streamOptions = ["QUIZ", "EXERCISE"].includes(conversation.mode)
    ? { maxTokens: 16000 }
    : undefined;

  let stream;
  try {
    stream = await streamAIResponse(chatMessages, streamOptions);
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
        [savedContent.substring(0, 50), conversationId]
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

const VISIBLE_SELF_CORRECTION_MARKERS = [
  /\(\s*(?:correction|rectification)\s*[:：]/iu,
  /\battente\s*[,!:…]/iu,
  /\bcorrection du calcul\b/iu,
  /\bnon[,!:…]\s*(?:recalculons|reprenons|recommençons|il faut corriger)\b/iu,
  /\bselon (?:le|les) instructions\b/iu,
  /\bje me suis (?:trompé|contredit)\b/iu,
  /\bje dois me corriger\b/iu,
  /\b(?:reprenons|recommençons) depuis le début\b/iu,
];

function hasVisibleSelfCorrection(exercises) {
  return exercises.some((exercise) =>
    [exercise.question, exercise.answer, exercise.explanation]
      .filter((text) => typeof text === "string")
      .some((text) => VISIBLE_SELF_CORRECTION_MARKERS.some((marker) => marker.test(text)))
  );
}

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
  const requestedCount = Number(count);
  const exerciseCount = Number.isInteger(requestedCount) && requestedCount > 0 ? requestedCount : 3;
  const normalizedTopic = String(topic ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const requiresVariationAudit = /variations?|etudes?.{0,40}fonctions?/i.test(normalizedTopic);
  const requiresRationalDecompositionAudit = /asymptotes?|fonctions? rationnelles?|decomposition rationnelle/i.test(normalizedTopic);
  const requiresDrawProbabilityAudit = /tirages?.*(?:sans remise|successifs?)|sans remise/i.test(normalizedTopic);
  const requiresBinomialAudit = /loi\s+binomiale|binomiale/i.test(normalizedTopic);

  const sharedContext = `Génère ${exerciseCount} exercices de ${subject} pour un élève de ${gradeLevel} en Côte d'Ivoire.
${topic ? `Sujet spécifique : ${topic}` : ""}
Difficulté : ${difficulty ?? "MEDIUM"}
Type : ${typeInstruction}

=== PROGRAMME OFFICIEL IVOIRIEN (respecte-le strictement) ===
${curriculumBlock}
=== FIN DU PROGRAMME ===

Contraintes :
- Reste STRICTEMENT dans le programme ivoirien ci-dessus pour ce niveau (pas de notions hors-programme).
- Si le sujet spécifique donne une fonction ou une expression explicite, conserve-la exactement dans les exercices et leurs contrôles numériques. Pour plusieurs exercices sur cette expression, varie les questions posées plutôt que d'inventer d'autres fonctions.
- Quand une situation concrète est cohérente avec les valeurs et le domaine mathématique, ancre-la en Côte d'Ivoire (FCFA, villes, cacao/café, prénoms locaux). Ne force pas une fonction dans un contexte physique qui rendrait ses valeurs impossibles ; garde alors un exercice mathématique abstrait. N'utilise jamais l'euro ni le dollar.
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
6. Choisis un contexte seulement s'il respecte le domaine et le sens des valeurs. Une récolte, une distance, un âge, une masse ou un effectif ne peut pas être négatif. Pour une grandeur forcément non négative définie à partir d'un instant de départ, vérifie aussi l'expression au départ et aux deux premiers pas après le départ. Pour une variable physique à domaine borné (par ex. l'avancement x d'une réaction, avec 0 ≤ x ≤ xmax), donne les bornes réelles et vérifie seulement dans cet intervalle. Si une valeur est impossible, change le contexte ou garde un exercice abstrait ; ne change pas une formule imposée par le sujet.
7. Exception pédagogique : si le sujet demande explicitement à l'élève de tester la validité ou la cohérence d'un modèle concret, conserve le contexte comme contre-exemple et fais de l'impossibilité la question à résoudre. Ne présente jamais le modèle impossible comme valide. Dans ce cas, utilise le mode "challenge".
${requiresVariationAudit ? `8. Le sujet demande une étude de fonction/variations : pour chaque exercice concerné, ajoute un check "derivative_signs" avec l'expression de f et tous les intervalles de monotonie séparés par les points critiques et les valeurs interdites. Chaque intervalle doit être inclus dans le domaine réel de f : pour ln(g(x)), impose g(x)>0 (par exemple, ln(x)/x est définie sur (0,+∞)) et n'échantillonne jamais en dehors de ce domaine. Utilise from:null pour -∞, to:null pour +∞, et trend:"increasing" ou "decreasing". Exemple : {"type":"derivative_signs","expr":"(x^2+2*x+1)/(x-1)","intervals":[{"from":null,"to":-1,"trend":"increasing"},{"from":-1,"to":1,"trend":"decreasing"},{"from":1,"to":3,"trend":"decreasing"},{"from":3,"to":null,"trend":"increasing"}]}. Le serveur recalculera le signe de f' en plusieurs points de chaque intervalle. Ne fournis pas ce check si tu n'as pas déterminé le domaine et les intervalles correctement.` : ""}
${requiresRationalDecompositionAudit ? `9. Pour chaque fonction rationnelle, vérifie aussi la division euclidienne avec un check "rational_decomposition" : {"type":"rational_decomposition","numeratorExpr":"3*x^2-6*x+2","denominatorExpr":"x-1","quotientExpr":"3*x-3","remainderExpr":"-1"}. Le serveur contrôle l'identité N(x)=D(x)Q(x)+R(x) sur plusieurs valeurs. Reprends exactement le quotient et le reste validés dans la correction et déduis-en la position par rapport à l'asymptote.` : ""}
${requiresDrawProbabilityAudit ? `10. Pour les tirages sans remise, choisis explicitement la convention ordonnée : l'énoncé doit dire que les objets sont tirés successivement, et le dénombrement compte des séquences ordonnées. Fournis un check "draw_probability" avec red, blue, ordered:true, totalOutcomes, favorableOutcomes et claimedProbability. Pour deux objets de couleurs différentes, favorableOutcomes=2*red*blue et totalOutcomes=(red+blue)*(red+blue-1).` : ""}
${requiresBinomialAudit ? `11. Le sujet demande une loi binomiale : pour CHAQUE exercice, fournis un check "binomial_distribution" avec son planIndex (de 0 à ${exerciseCount - 1}), n, p, precision et toutes les probabilités P(X=k) de k=0 à n dans "probabilities" sous la forme [{"k":0,"claimed":0.02825}, ...]. Utilise precision:5 si les valeurs sont affichées à 5 décimales. Le serveur recalculera chaque valeur et la somme du tableau ; reprends uniquement les valeurs recalculées dans l'exercice.` : ""}

Ce raisonnement (étapes 1 à 4) doit rester interne — n'expose jamais le détail des calculs dans le JSON final, seulement les résultats.

Réponds UNIQUEMENT avec ce JSON compact (pas d'énoncé rédigé, pas d'explication) :
{
  "plans": [
    {
      "idea": "angle/sujet précis de l'exercice",
      "params": "paramètres numériques validés (équation, valeurs, résultat attendu)",
      "verification": { "expression calculée (ex. f(2))": "valeur exacte obtenue au calcul" },
      "contextAudit": {
        "mode": "nonnegative",
        "expression": "expression de f(x), vide si exercice abstrait ou sans fonction",
        "domainStart": 0,
        "domainEnd": 10
      }
    }
  ],
  "checks": [
    { "type": "geometric", "u0": 100000, "q": 1.02, "n": 10, "claimed": 121899.44 },
    { "type": "arithmetic", "u0": 5, "r": 3, "n": 12, "claimed": 41 },
    { "type": "function_eval", "expr": "(x^2+2)/(x-1)", "x": 2, "claimed": 6 },
    { "type": "derivative_eval", "expr": "x^3-2*x", "x": 2, "claimed": 10 },
    { "type": "derivative_signs", "expr": "(x^2+2*x+1)/(x-1)", "intervals": [{ "from": null, "to": -1, "trend": "increasing" }, { "from": -1, "to": 1, "trend": "decreasing" }, { "from": 1, "to": 3, "trend": "decreasing" }, { "from": 3, "to": null, "trend": "increasing" }] }
  ]
}
Le champ "verification" doit contenir CHAQUE valeur calculée à l'étape 3, avec exactement la même valeur que celle qui apparaîtra dans l'énoncé final — ces valeurs serviront de référence pour l'étape de rédaction.
Chaque plan doit aussi fournir "contextAudit" : mode "nonnegative" pour une grandeur réelle nécessairement non négative, "signed" pour une grandeur réelle pouvant être négative, "abstract" si l'exercice ne prétend pas modéliser une situation concrète, ou "challenge" uniquement si l'élève doit explicitement détecter qu'un modèle concret est impossible ou incohérent. Avec "challenge", inscris cette détection comme objectif central dans "idea" et fais apparaître la question dans l'énoncé. Ne choisis pas "challenge" pour excuser une incohérence accidentelle. En mode "nonnegative", donne l'expression mathématique dans la syntaxe de mathjs, avec la seule variable "x", sans unités ni égalité (ex. "0.1-x"), et la valeur numérique du début réel de son domaine. Pour un domaine borné, donne aussi "domainEnd" avec sa borne physique maximale : le serveur vérifiera le début, le milieu et la fin de l'intervalle valide. Exemple pour un avancement de réaction : une quantité restante de 0.1−x mol, avec 0≤x≤0.075, s'écrit {"mode":"nonnegative","expression":"0.1-x","domainStart":0,"domainEnd":0.075}. N'écris pas ξ, xi, n0, une unité, ou un nom de quantité dans "expression". Sinon, le serveur vérifiera le début du domaine et les deux valeurs suivantes.
Le champ "checks" est recalculé indépendamment côté serveur pour repérer des erreurs de calcul. Pour CHAQUE valeur calculée qui correspond à l'un des cas ci-dessous, ajoute obligatoirement un check. Il ne peut être vide que si aucun calcul prévu ne correspond à ces cas. Utilise des nombres, pas du texte ni une fraction littérale :
- suite géométrique : u_n = u0 × q^n → {"type":"geometric","u0":...,"q":...,"n":...,"claimed":...}
- suite arithmétique : u_n = u0 + n×r → {"type":"arithmetic","u0":...,"r":...,"n":...,"claimed":...}
- image f(x) d'une fonction polynomiale/rationnelle à une variable en un point → {"type":"function_eval","expr":"expression avec x, ex (x^2+2)/(x-1)","x":...,"claimed":...}
- valeur de la dérivée f'(a) d'une fonction à une variable en un point → {"type":"derivative_eval","expr":"expression de f(x)","x":...,"claimed":...}. Le serveur recalcule f'(x) symboliquement puis l'évalue au point indiqué ; ce contrôle valide cette valeur ponctuelle, pas à lui seul toute une étude de fonction.
- signes de la dérivée dans une étude de variations → {"type":"derivative_signs","expr":"expression de f(x)","intervals":[{"from":...,"to":...,"trend":"increasing"}]}. Utilise null pour une borne infinie et décris tous les intervalles séparés par les points critiques et les valeurs interdites. Le serveur recalcule f' en plusieurs points intérieurs de chaque intervalle.
${requiresRationalDecompositionAudit ? `- division euclidienne d'une fonction rationnelle → {"type":"rational_decomposition","numeratorExpr":"3*x^2-6*x+2","denominatorExpr":"x-1","quotientExpr":"3*x-3","remainderExpr":"-1"}.
` : ""}${requiresDrawProbabilityAudit ? `- tirage sans remise de deux objets de deux couleurs → {"type":"draw_probability","red":5,"blue":3,"ordered":true,"totalOutcomes":56,"favorableOutcomes":30,"claimedProbability":0.5357142857142857}. Le champ ordered doit correspondre au vocabulaire de l'énoncé.
` : ""}${requiresBinomialAudit ? `- loi binomiale complète → {"type":"binomial_distribution","planIndex":0,"n":10,"p":0.3,"precision":5,"probabilities":[{"k":0,"claimed":0.02825},{"k":1,"claimed":0.12106}]}. Inclus toutes les valeurs k=0,...,n pour chaque exercice binomial.
` : ""}N'ajoute RIEN dans "checks" pour un autre type de calcul (limite, intégrale, nombre complexe, statistiques, preuve, équation à résoudre...) — laisse le tableau vide plutôt que de forcer un cas qui ne correspond pas exactement.`;

  // Un seul appel à l'étape 1, qui renvoie plans + checks déjà parsés (best
  // effort : un JSON illisible donne des tableaux vides plutôt qu'une
  // exception, cohérent avec le comportement déjà en place avant le
  // garde-fou de calcul).
  async function runVerificationStep() {
    const raw = await generateJSON(
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
    try {
      const parsed = JSON.parse(raw);
      const plans = Array.isArray(parsed?.plans) ? parsed.plans : [];
      const checks = Array.isArray(parsed?.checks) ? parsed.checks : [];
      const contextChecks = plans.map((plan, planIndex) => {
        const audit = plan?.contextAudit;
        if (audit?.mode === "nonnegative") {
          return {
            type: "nonnegative_samples",
            expr: audit.expression,
            domainStart: audit.domainStart,
            domainEnd: audit.domainEnd,
            planIndex,
          };
        }
        if (["signed", "abstract", "challenge"].includes(audit?.mode)) {
          return { type: "context_audit", mode: audit.mode, planIndex };
        }
        return { type: "invalid_context_audit", planIndex };
      });
      return { plans, checks: [...checks, ...contextChecks] };
    } catch (err) {
      console.error("[chat-service] réponse IA non-JSON pour la vérification exercices:", raw);
      return { plans: [], checks: [] };
    }
  }

  let plans, checks;
  try {
    ({ plans, checks } = await runVerificationStep());
  } catch (err) {
    return sendGroqError(res, err, "vérification paramètres exercices");
  }

  const validateMathChecks = (candidateChecks) => {
    const verificationResult = verifyChecks(candidateChecks, {
      requireDerivativeSigns: requiresVariationAudit,
      requiredDerivativeSignCount: requiresVariationAudit ? 1 : 0,
      requireRationalDecompositions: requiresRationalDecompositionAudit,
      requiredRationalDecompositionCount: requiresRationalDecompositionAudit ? 1 : 0,
      requireDrawProbabilities: requiresDrawProbabilityAudit,
      requiredDrawProbabilityCount: requiresDrawProbabilityAudit ? 1 : 0,
      requireBinomialDistributions: requiresBinomialAudit,
      requiredBinomialDistributionCount: requiresBinomialAudit ? exerciseCount : 0,
    });
    if (!requiresBinomialAudit) return verificationResult;

    const binomialChecks = Array.isArray(candidateChecks)
      ? candidateChecks.filter((check) => check?.type === "binomial_distribution")
      : [];
    const planIndexes = binomialChecks.map((check) => check.planIndex);
    const coversEveryExercise =
      planIndexes.length === exerciseCount &&
      new Set(planIndexes).size === exerciseCount &&
      planIndexes.every((index) => Number.isInteger(index) && index >= 0 && index < exerciseCount);
    if (coversEveryExercise) return verificationResult;

    return {
      ...verificationResult,
      ok: false,
      results: [
        ...verificationResult.results,
        {
          type: "binomial_distribution",
          ok: false,
          reason: `un tableau binomial complet et distinct est requis pour chacun des ${exerciseCount} exercices`,
        },
      ],
    };
  };

  // Garde-fou de recalcul programmatique (voir mathCheck.js) : l'étape 1
  // ci-dessus ne fait que "penser" avoir vérifié ses propres valeurs — rien
  // ne garantissait jusqu'ici qu'elle ait vraiment recalculé juste (voir
  // l'audit RAG du 2026-09-04 : erreur de ~0,6% sur u8/u9 et de ~1,4% sur
  // un ratio logarithmique, toutes deux passées inaperçues). On recalcule
  // ici indépendamment chaque "check" couvert (suites géométrique/
  // arithmétique, image d'une fonction simple en un point — voir
  // mathCheck.js pour le détail et les limites de couverture) et, en cas
  // d'écart au-delà de la tolérance, on relance l'étape 1 UNE fois plutôt
  // que de laisser passer une valeur fausse jusqu'à l'élève. Une seule
  // relance (pas de boucle) : si l'écart persiste, on bloque la réponse
  // plutôt que de présenter un résultat incohérent à l'élève.
  let verification = validateMathChecks(checks);
  // Diagnostic (même logique que le log "budget Groq" existant) : combien
  // de checks l'étape 1 a-t-elle rempli, et combien sont couverts par le
  // garde-fou (ni vide ni "skipped") — utile pour juger si l'étape 1
  // remplit vraiment "checks" en pratique, indépendamment d'un écart.
  console.log(
    `[chat-service] garde-fou de calcul : ${checks.length} check(s) reçu(s), ${
      verification.results.filter((r) => !r.skipped).length
    } couvert(s), ok=${verification.ok}`
  );
  if (!verification.ok) {
    console.warn(
      "[chat-service] garde-fou de calcul : écart détecté à l'étape 1, relance —",
      JSON.stringify(verification.results)
    );
    try {
      const retry = await runVerificationStep();
      const retryVerification = validateMathChecks(retry.checks);
      if (retryVerification.ok && retry.plans.length > 0) {
        console.log("[chat-service] garde-fou de calcul : relance propre, valeurs corrigées utilisées");
        plans = retry.plans;
        checks = retry.checks;
        verification = retryVerification;
      } else {
        console.warn(
          "[chat-service] garde-fou de calcul : la relance n'a pas corrigé l'écart —",
          JSON.stringify(retryVerification.results)
        );
        return res.status(502).json({
          error: "Je n'ai pas pu vérifier la cohérence des calculs proposés. Réessaie avec un autre sujet ou une autre demande.",
        });
      }
    } catch (err) {
      console.error(
        "[chat-service] garde-fou de calcul : échec de la relance de l'étape 1:",
        err.message
      );
      return res.status(502).json({
        error: "Je n'ai pas pu vérifier la cohérence des calculs proposés. Réessaie avec un autre sujet ou une autre demande.",
      });
    }
  }

  if (plans.length !== exerciseCount) {
    console.warn(
      `[chat-service] vérification incomplète : ${plans.length}/${exerciseCount} plan(s) reçu(s)`
    );
    return res.status(502).json({
      error: "Je n'ai pas pu préparer et vérifier tous les exercices demandés. Réessaie dans un instant.",
    });
  }

  // --- Étape 2/2 : rédaction finale à partir des paramètres validés ---
  // reasoning_effort "none" : les vérifications précédentes sont terminées,
  // tout le budget va à la sortie visible.
  // On transmet les valeurs de référence de l'étape 1 à la rédaction,
  // tout en demandant une nouvelle vérification avant de les utiliser.
  const plansBlock =
    plans.length > 0
      ? `\n\nParamètres et valeurs de référence issus de l'étape précédente. Vérifie-les à partir des énoncés avant de les utiliser :\n${plans
          .map((p, i) => {
            const verif =
              p.verification && typeof p.verification === "object" && !Array.isArray(p.verification)
                ? ` [valeurs vérifiées à annoncer telles quelles : ${Object.entries(p.verification)
                    .map(([k, v]) => `${k} = ${v}`)
                    .join(", ")}]`
                : "";
            const context = p.contextAudit
              ? ` [cadre : ${p.contextAudit.mode}${
                  p.contextAudit.mode === "nonnegative"
                    ? `, expression=${p.contextAudit.expression}, domaine à partir de x=${p.contextAudit.domainStart}${p.contextAudit.domainEnd == null ? "" : ` jusqu'à x=${p.contextAudit.domainEnd}`}`
                    : ""
                }]`
              : "";
            return `${i + 1}. ${p.idea} — ${p.params}${verif}${context}`;
          })
          .join("\n")}`
      : "";

  const variationChecksBlock = checks
    .filter((check) => check?.type === "derivative_signs" && Array.isArray(check.intervals))
    .map((check) => {
      const intervals = check.intervals
        .map(({ from, to, trend }) => {
          const left = from === null ? "-∞" : from;
          const right = to === null ? "+∞" : to;
          return `[${left}, ${right}] : ${trend === "increasing" ? "croissante (flèche ↗)" : "décroissante (flèche ↘)"}`;
        })
        .join(" ; ");
      return `Variations vérifiées pour f(x)=${check.expr} : ${intervals}. Reprends ces sens dans la correction finale.`;
    })
    .join("\n");
  const rationalChecksBlock = checks
    .filter((check) => check?.type === "rational_decomposition")
    .map(formatRationalDecomposition)
    .join("\n");
  const drawChecksBlock = checks
    .filter((check) => check?.type === "draw_probability")
    .map((check) => `Tirage vérifié (ordonné) : ${check.totalOutcomes} issues, ${check.favorableOutcomes} favorables, probabilité ${check.claimedProbability}. Garde le même dénombrement et le vocabulaire « successivement ».`)
    .join("\n");
  const binomialChecksBlock = checks
    .map((check, index) => {
      if (check?.type !== "binomial_distribution") return "";
      const result = verification.results[index];
      if (!Array.isArray(result?.distribution)) return "";
      const precision = Number.isInteger(check.precision) ? check.precision : 5;
      const values = result.distribution
        .map(({ k, computed }) => `P(X=${k})=${Number(computed.toFixed(precision))}`)
        .join(" ; ");
      return `Exercice ${check.planIndex + 1}, X~B(${check.n}, ${check.p}), probabilités recalculées et arrondies à ${precision} décimales : ${values}. La somme non arrondie vaut ${result.sumComputed}; la somme arrondie doit rester proche de 1.`;
    })
    .filter(Boolean)
    .join("\n");

  const draftPrompt = `${sharedContext}${plansBlock}
${variationChecksBlock ? `\n\nRéférences de variations recalculées par le serveur :\n${variationChecksBlock}` : ""}
${rationalChecksBlock ? `\n\nRéférences de décomposition recalculées par le serveur :\n${rationalChecksBlock}` : ""}
${drawChecksBlock ? `\n\nRéférences de tirage recalculées par le serveur :\n${drawChecksBlock}` : ""}
${binomialChecksBlock ? `\n\nRéférences binomiales recalculées par le serveur :\n${binomialChecksBlock}` : ""}

Rédige maintenant les ${exerciseCount} exercices complets (énoncé + réponse + explication). Les énoncés, réponses et explications doivent être cohérents entre eux et avec les calculs. Vérifie que chaque réponse découle de l'énoncé et que les étapes de la correction aboutissent au résultat annoncé. Pour les limites, ne qualifie pas de forme indéterminée un produit dont les signes déterminent la limite, par exemple (−∞)×(+∞)=−∞. Relis chaque énoncé pour supprimer les répétitions accidentelles de mots (par exemple « variable aléatoire aléatoire »), les formulations maladroites et les coquilles. Les explications sont destinées à l'élève : donne une solution pédagogique claire et finalisée, sans brouillon, hésitation, tentative abandonnée, commentaire sur tes instructions ou autocorrection. Respecte aussi le cadre indiqué pour chaque exercice : une grandeur réelle non négative ne doit jamais prendre une valeur négative sur le domaine annoncé. Si une situation concrète ne convient pas à la fonction, présente l'exercice de façon abstraite plutôt que de donner une interprétation fausse. Exception : si le cadre est "challenge", l'énoncé doit demander explicitement si le modèle est cohérent et la correction doit démontrer pourquoi il est impossible ; ne présente jamais les valeurs impossibles comme réalistes. Pour toute fraction issue d'un reste négatif, simplifie le signe : écris Q(x)−|R|/D(x), jamais Q(x)+(-|R|)/D(x). Applique cette simplification dans l'énoncé, la réponse et chaque étape d'explication.
${requiresVariationAudit ? `Pour tout exercice qui demande un tableau de variations, le champ "answer" DOIT contenir le tableau complet sous forme de tableau Markdown (avec une ligne d'en-tête et des séparateurs |), pas seulement une description en prose. Le tableau indique les bornes du domaine, les points critiques, le signe de f'(x) sur chaque intervalle, le sens de variation de f et les valeurs de f aux points critiques. Écris les formules dans les cellules avec $...$ pour qu'elles soient rendues par KaTeX. Reprends exactement les sens de variation validés dans les références du serveur : une fonction croissante se représente par une flèche ↗, une fonction décroissante par une flèche ↘. Vérifie dans le tableau que chaque flèche correspond au signe de f'(x) et au sens écrit en prose ; ne les inverse pas. Par exemple, si les variations vérifiées sont croissante puis décroissante, la ligne de f doit monter vers le maximum puis redescendre. La prose peut compléter le tableau dans "explanation", mais ne le remplace pas.` : ""}
${requiresBinomialAudit ? `Lorsqu'un exercice demande la loi complète, présente sa réponse sous forme de tableau Markdown à deux colonnes (k et P(X=k)), avec chaque entier de 0 à n. Écris chaque ligne sur sa propre ligne et sépare les lignes par un vrai saut de ligne (dans la chaîne JSON, encode-le par \\n) ; ne mets jamais tout le tableau sur une seule ligne, sinon il ne sera pas affiché comme un tableau. Indique aussi la formule générale P(X=k)=C(n,k)p^k(1-p)^(n-k). Reprends exactement les probabilités calculées par le serveur ci-dessus ; ne les recalcule pas dans la rédaction et n'en omets aucune.` : ""}

Si tu repères une contradiction ou si tu ne peux pas vérifier un résultat, ne l'invente pas et ne la masque pas : réponds uniquement avec {"error":"calcul incohérent"}. L'API indiquera que la génération a échoué et demandera une nouvelle tentative. Pour les calculs qui ne sont pas couverts par les vérifications numériques, sois prudent et n'affirme pas un résultat dont tu n'es pas sûr.
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

  const systemPrompt =
    "Tu es un générateur d'exercices pour le programme scolaire ivoirien. Réponds uniquement en JSON valide. Formules LaTeX : entoure TOUJOURS une formule mathématique de $ (inline) ou $$ (bloc) — jamais de parenthèses/crochets seuls comme \"( n \\in \\mathbb{N}^* )\" — sinon elle s'affiche en texte brut au lieu d'un symbole mathématique côté élève.";
  // Une étude complète avec tableau de variations, ou une loi binomiale
  // complète, produit plusieurs tableaux détaillés. Le plafond standard de
  // 6000 tokens tronquait parfois le JSON avant la fin des trois réponses ;
  // réserver plus de sortie pour ces formats structurés évite un JSON invalide.
  const draftMaxTokens = requiresVariationAudit || requiresBinomialAudit ? 10000 : 6000;
  let raw;
  let result;
  try {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      raw = await generateJSON(
        [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content:
              draftPrompt +
              (attempt === 0
                ? ""
                : "\n\nRéécris tous les exercices en réponses finales propres. Supprime tout brouillon, hésitation, autocorrection et toute correction ou rectification entre parenthèses dans les énoncés. Relis chaque réponse pour éviter les contradictions entre le résultat annoncé et les étapes."),
          },
        ],
        { maxTokens: draftMaxTokens, reasoningEffort: "none" }
      );
      result = JSON.parse(raw);
      result.exercises = normalizeExercises(result?.exercises);
      if (!Array.isArray(result?.exercises) || !hasVisibleSelfCorrection(result.exercises)) break;
      if (attempt === 1) {
        console.warn("[chat-service] autocorrection visible après une nouvelle génération pour exercises/generate");
        return res.status(502).json({
          error: "Je n'ai pas réussi à produire un corrigé clair. Réessaie avec un autre sujet.",
        });
      }
    }
  } catch (err) {
    if (err instanceof SyntaxError) {
      console.error("[chat-service] réponse IA non-JSON pour exercises/generate:", raw);
      return res.status(502).json({ error: "Réponse invalide de l'IA" });
    }
    return sendGroqError(res, err, "génération exercices");
  }

  try {
    if (result?.error) {
      return res.status(502).json({
        error: "Je n'ai pas pu produire des exercices dont les calculs sont cohérents. Réessaie avec un autre sujet ou une autre demande.",
      });
    }
    if (
      !Array.isArray(result?.exercises) ||
      result.exercises.length !== exerciseCount ||
      result.exercises.some(
        (exercise) =>
          typeof exercise?.question !== "string" ||
          typeof exercise?.answer !== "string" ||
          typeof exercise?.explanation !== "string" ||
          (type === "QCM" &&
            (!Array.isArray(exercise?.options) ||
              exercise.options.length !== 4 ||
              exercise.options.some((option) => typeof option !== "string")))
      )
    ) {
      console.error("[chat-service] réponse IA incomplète ou invalide pour exercises/generate");
      return res.status(502).json({ error: "La génération des exercices a échoué. Réessaie dans un instant." });
    }
    res.json({ ...result, exercises: normalizeExercises(result.exercises) });
  } catch (err) {
    console.error("[chat-service] réponse IA non-JSON pour exercises/generate:", raw);
    res.status(502).json({ error: "Réponse invalide de l'IA" });
  }
});

app.post("/exercises/correct", async (req, res) => {
  const { userId } = identity(req);
  if (!userId) return res.status(401).json({ error: "Non authentifié" });

  // `studentAnswerImage` : data URL base64 d'une photo de la réponse
  // manuscrite de l'élève (voir page.tsx /exercises côté frontend),
  // alternative à `studentAnswer` tapé au clavier — l'un des deux suffit.
  const { question, studentAnswer, studentAnswerImage, correctAnswer, subject, gradeLevel } = req.body || {};
  if (!question || (!studentAnswer && !studentAnswerImage)) {
    return res.status(400).json({ error: "Question et réponse de l'élève (texte ou photo) requises" });
  }

  const sharedContext = `Niveau : ${gradeLevel ?? "niveau non précisé"}
Matière : ${subject ?? "matière non précisée"}

Question : ${question}
${correctAnswer ? `Réponse attendue : ${correctAnswer}` : ""}
${
  studentAnswerImage
    ? "Réponse de l'élève : voir la photo jointe (travail manuscrit) — transcris-la fidèlement avant d'évaluer."
    : `Réponse de l'élève : ${studentAnswer}`
}`;

  // --- Étape 1/2 : vérification silencieuse de la note et du calcul ---
  // Même logique que pour /exercises/generate (voir plus haut) : sortie
  // visible courte attendue, mais reasoning_effort "default" et un budget
  // max_tokens généreux pour laisser au raisonnement caché la place de
  // vérifier/recalculer la méthode correcte avant de trancher la note.
  const verifyPrompt = `${sharedContext}

Tâche : NE RÉDIGE PAS le feedback complet. ${
    studentAnswerImage
      ? "Transcris d'abord fidèlement la réponse manuscrite visible sur la photo jointe (si un passage est illisible, dis-le plutôt que de deviner). Puis "
      : ""
  }détermine et VÉRIFIE en interne la note exacte sur 20 selon le barème ivoirien (APC), ainsi que le résultat/la méthode corrects étape par étape si un calcul ou une résolution est en jeu. Si un premier calcul te semble incohérent, recorrige-le en interne avant de répondre — sans que cette étape n'apparaisse nulle part.

Réponds UNIQUEMENT avec ce JSON compact (pas de rédaction complète) :
{
  "transcription": "transcription fidèle de la réponse manuscrite (uniquement si une photo a été fournie, sinon chaîne vide)",
  "score": 15,
  "keyFacts": "résultat/méthode corrects validés, et liste brève des erreurs précises de l'élève à mentionner"
}`;

  // Image envoyée UNE SEULE FOIS, à cette étape de vérification — l'étape 2
  // (rédaction) réutilise la transcription déjà extraite ici plutôt que de
  // rejoindre l'image une deuxième fois, pour ne pas payer deux fois son
  // coût fixe en tokens (voir IMAGE_TOKEN_COST, groqClient.js).
  const verifyUserContent = studentAnswerImage
    ? [
        { type: "text", text: verifyPrompt },
        { type: "image_url", image_url: { url: studentAnswerImage } },
      ]
    : verifyPrompt;

  let rawVerification;
  try {
    rawVerification = await generateJSON(
      [
        {
          role: "system",
          content:
            "Tu prépares en silence l'évaluation d'une copie d'élève ivoirien (programme MENA/DPFC, APC). Réponds uniquement en JSON compact, sans rédaction complète.",
        },
        { role: "user", content: verifyUserContent },
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
      ? `\n\nÉvaluation déjà vérifiée à utiliser telle quelle (ne la recalcule pas) :\n${
          verification.transcription
            ? `- Transcription de la réponse manuscrite (photo) : ${verification.transcription}\n`
            : ""
        }- Note validée : ${verification.score ?? "?"}/20\n- Éléments validés : ${verification.keyFacts ?? "aucun"}`
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
            "Tu es un correcteur pédagogique bienveillant pour le programme scolaire ivoirien (MENA/DPFC, Approche Par les Compétences). Note sur 20 selon le barème ivoirien, emploie le vocabulaire APC et des exemples ancrés en Côte d'Ivoire (FCFA, villes ivoiriennes). Réponds uniquement en JSON valide. Formules LaTeX : entoure TOUJOURS une formule mathématique de $ (inline) ou $$ (bloc) — jamais de parenthèses/crochets seuls comme \"( n \\in \\mathbb{N}^* )\" — sinon elle s'affiche en texte brut au lieu d'un symbole mathématique côté élève.",
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
    res.json(normalizeCorrection(correction));
  } catch (err) {
    console.error("[chat-service] réponse IA non-JSON pour exercises/correct:", raw);
    res.status(502).json({ error: "Réponse invalide de l'IA" });
  }
});

// --- Admin --------------------------------------------------------------
// /admin/stats et /admin/conversations* donnent accès à des données
// agrégées ou appartenant à N'IMPORTE QUEL utilisateur (pas de filtre
// user_id, contrairement à /conversations) : une vérification frontend seule
// (frontend/src/lib/auth.ts::requireAdmin) ne suffit pas à les protéger si
// jamais elles étaient appelées autrement (accès direct au gateway, autre
// client...). On vérifie donc ICI le rôle ROLE_ADMIN, porté par
// x-user-roles — header injecté par le gateway à partir du JWT vérifié (voir
// gateway/src/auth.js), donc fiable (le gateway est la seule porte d'entrée
// réseau vers ce service — voir docker-compose.yml, port non publié
// publiquement).
function isAdmin(req) {
  const roles = (req.headers["x-user-roles"] || "").split(",").filter(Boolean);
  return roles.includes("ROLE_ADMIN");
}

app.get("/admin/stats", async (req, res) => {
  if (!isAdmin(req)) {
    return res.status(403).json({ error: "Accès réservé aux administrateurs" });
  }

  const [conversations, messages] = await Promise.all([
    pool.query("SELECT COUNT(*)::int AS count FROM chat_conversations"),
    pool.query("SELECT COUNT(*)::int AS count FROM chat_messages"),
  ]);

  res.json({
    totalConversations: conversations.rows[0].count,
    totalMessages: messages.rows[0].count,
  });
});

// Liste des conversations d'un utilisateur donné, pour l'écran admin de
// consultation en lecture seule (/admin/users/:userId/conversations). Même
// requête que GET /conversations, mais filtrée par un userId arbitraire
// passé en query plutôt que par l'identité de l'appelant.
app.get("/admin/conversations", async (req, res) => {
  if (!isAdmin(req)) {
    return res.status(403).json({ error: "Accès réservé aux administrateurs" });
  }

  const { userId } = req.query;
  if (!userId) {
    return res.status(400).json({ error: "userId requis" });
  }

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

// Détail en lecture seule d'une conversation appartenant à N'IMPORTE QUEL
// utilisateur (contrairement à GET /conversations/:id qui exige
// user_id = appelant). Volontairement pas de route PATCH/DELETE
// équivalente : la consultation admin ne permet ni modification ni
// suppression des conversations d'un autre utilisateur (voir consigne
// produit) — seules ses propres conversations restent modifiables/
// supprimables via les routes existantes.
app.get("/admin/conversations/:id", async (req, res) => {
  if (!isAdmin(req)) {
    return res.status(403).json({ error: "Accès réservé aux administrateurs" });
  }

  const convResult = await pool.query(
    "SELECT * FROM chat_conversations WHERE id = $1",
    [req.params.id]
  );
  const conversation = convResult.rows[0];
  if (!conversation) {
    return res.status(404).json({ error: "Conversation introuvable" });
  }

  const { messages, hasMore, total } = await fetchMessagesPage(req.params.id, parseBeforeParam(req));

  res.json({ ...conversation, messages, hasMore, totalMessages: total });
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
