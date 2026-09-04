import Groq from "groq-sdk";

let groq;

// Plafond TPM (tokens/minute) de l'organisation sur le tier Groq actuel
// (voir erreur "rate_limit_exceeded" observée le 31/08 — remonter cette
// valeur si le compte est upgradé, voir console.groq.com/settings/billing).
const TPM_LIMIT = Number(process.env.GROQ_TPM_LIMIT) || 8000;
// Marge de sécurité : l'estimation de estimateTokens() est approximative,
// et Groq facture le prompt légèrement différemment selon le formatage
// interne des messages (rôles, séparateurs) — on ne veut pas retomber sur
// un 413 à cause d'un sous-comptage.
const SAFETY_MARGIN = 500;
// Plancher en dessous duquel on refuse d'appeler Groq plutôt que d'envoyer
// une requête presque garantie de retomber sur le bug "raisonnement caché
// consomme tout le budget → réponse vide" (voir groqClient.js plus bas).
const MIN_MAX_TOKENS = 2500;
// Plancher plus bas utilisable uniquement quand reasoning_effort="none" :
// sans raisonnement caché à financer, tout le budget va à la sortie
// visible, donc un budget restreint reste exploitable (voir l'approche en
// deux appels de /exercises/generate et /exercises/correct dans index.js —
// le second appel, rédaction seule, peut se contenter de ce plancher).
const MIN_MAX_TOKENS_NO_REASONING = 800;
// Plafond dur de Groq sur `max_tokens` pour qwen/qwen3.6-27b, indépendant du
// budget TPM restant — confirmé par l'erreur 400 obtenue le 2026-09-04 dès
// que GROQ_TPM_LIMIT a été relevé au-delà de cette valeur : "max_tokens must
// be less than or equal to 16384, the maximum value for max_tokens is less
// than the context_window for this model". Avant ce relevage, l'ancien
// TPM_LIMIT (8000) ramenait toujours `available` largement sous ce plafond
// par accident, ce qui le rendait invisible — computeMaxTokens() doit
// borner explicitement les deux limites (TPM ET plafond par requête), sinon
// une hausse de GROQ_TPM_LIMIT fait à nouveau échouer /exercises/generate et
// /exercises/correct (desiredMaxTokens: 100000, voir index.js) avec ce même
// 400. 16000 plutôt que 16384 pour garder une petite marge, par cohérence
// avec le desiredMaxTokens déjà utilisé pour QUIZ (voir index.js).
const MODEL_MAX_OUTPUT_TOKENS = 16000;

// Estimation grossière (~3 caractères/token). Mesuré le 31/08 sur ce
// contenu (français pédagogique + programme scolaire ivoirien) : le
// ratio ~4 caractères/token (correct pour de l'anglais générique)
// sous-comptait le vrai tokenizer Qwen de ~37% (promptEstimé 3209-3237
// vs prompt réel 4388-4426 déduit des erreurs 413 Groq), faisant
// dépasser TPM_LIMIT malgré computeMaxTokens(). ~3 caractères/token colle
// beaucoup plus près du réel pour ce type de contenu (accents, vocabulaire
// technique, contenu structuré).
function estimateTokens(text) {
  return Math.ceil((text ?? "").length / 3);
}

// Doit couvrir TOUT ce qui compte dans le prompt réellement envoyé à
// Groq — l'historique de conversation et le contexte RAG injecté sont
// déjà inclus ici puisqu'ils font partie de `messages` (voir chatMessages
// dans index.js /chat, et le prompt RAG+programme dans /exercises/generate),
// pas seulement le system prompt.
function estimatePromptTokens(messages) {
  return messages.reduce(
    // +4 : overhead approximatif par message (rôle, séparateurs internes).
    (total, m) => total + estimateTokens(m.content) + 4,
    0
  );
}

/**
 * Calcule le max_tokens réellement envoyé à Groq : le minimum entre le
 * budget désiré par l'appelant, ce qu'il reste de budget TPM une fois le
 * prompt estimé déduit, ET le plafond dur par requête de Groq pour ce
 * modèle (MODEL_MAX_OUTPUT_TOKENS) — les trois bornes s'appliquent
 * ensemble, aucune ne remplace les autres (voir le commentaire sur
 * MODEL_MAX_OUTPUT_TOKENS : sans elle, un TPM_LIMIT généreux laisse passer
 * un desiredMaxTokens surdimensionné tel quel jusqu'à Groq, qui le rejette).
 * Lève une erreur (err.code === "PROMPT_TOO_LARGE") plutôt que de laisser
 * Groq renvoyer un 413 brut, si même le plancher MIN_MAX_TOKENS ferait
 * dépasser TPM_LIMIT — ça peut arriver sur une conversation avec beaucoup
 * d'historique.
 */
function computeMaxTokens(messages, desiredMaxTokens, minMaxTokens = MIN_MAX_TOKENS) {
  const promptTokens = estimatePromptTokens(messages);
  const available = TPM_LIMIT - promptTokens - SAFETY_MARGIN;
  const finalMaxTokens = Math.min(desiredMaxTokens, available, MODEL_MAX_OUTPUT_TOKENS);

  // Diagnostic temporaire (voir désaccord observé le 31/08 entre cette
  // estimation et le "Requested" réel renvoyé par Groq en cas de 413) —
  // à retirer une fois l'estimation fiabilisée.
  console.log(
    `[chat-service] budget Groq: promptEstimé=${promptTokens} maxTokens=${finalMaxTokens} totalEstimé=${promptTokens + finalMaxTokens}`
  );

  if (available < minMaxTokens) {
    const err = new Error(
      `prompt estimé à ${promptTokens} tokens, budget restant ${available} < minimum ${minMaxTokens} (plafond TPM ${TPM_LIMIT})`
    );
    err.code = "PROMPT_TOO_LARGE";
    throw err;
  }

  return finalMaxTokens;
}

// Instancié à la demande (pas au chargement du module) : si GROQ_API_KEY
// manque, seule la route /chat échoue proprement — le reste du service
// (/health, /conversations) continue de fonctionner normalement.
function getGroqClient() {
  if (!process.env.GROQ_API_KEY) {
    throw new Error("NO_API_KEY");
  }
  if (!groq) {
    groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }
  return groq;
}

/**
 * Retourne un stream de complétion Groq. Lève une erreur si aucune clé
 * n'est configurée — c'est à l'appelant de décider quoi faire (ex.
 * réponse de démo, comme dans le monolithe).
 */
export async function streamAIResponse(messages, { temperature = 0.7, maxTokens = 6000 } = {}) {
  const client = getGroqClient();

  // Groq compte (prompt_tokens + max_tokens) contre la limite TPM du
  // compte, PAS la consommation réelle — un prompt volumineux (historique
  // de conversation long, contexte RAG) peut à lui seul dépasser le
  // budget disponible même avec un maxTokens par défaut raisonnable
  // (observé le 31/08 : 413 rate_limit_exceeded malgré maxTokens=6000,
  // à cause d'un prompt à ~4350 tokens). D'où le calcul dynamique ici,
  // plutôt qu'une constante fixe — voir computeMaxTokens() plus haut.
  const finalMaxTokens = computeMaxTokens(messages, maxTokens);

  return client.chat.completions.create({
    model: "qwen/qwen3.6-27b",
    messages,
    temperature,
    max_tokens: finalMaxTokens,
    stream: true,
    reasoning_format: "hidden",
    // "default" (pas "none") : laisse Qwen raisonner en interne avant de
    // répondre, sans jamais exposer ce raisonnement (reasoning_format
    // hidden). Nécessaire pour des contenus qui demandent une vérification
    // de cohérence (ex. génération d'exercices avec contraintes numériques
    // précises) — sans espace de raisonnement, le modèle "pensait à voix
    // haute" directement dans la réponse visible à l'élève quand il
    // détectait une incohérence en cours de génération (observé le 24/08).
    // Qwen3 n'accepte que "none" ou "default" pour ce paramètre (pas
    // "low"/"medium"/"high", réservé aux modèles GPT-OSS).
    //
    // Contrepartie connue de computeMaxTokens() : si le budget calculé est
    // faible (prompt déjà volumineux) et que le raisonnement caché le
    // consomme en entier, la réponse visible peut arriver vide ou tronquée
    // (finish_reason "length") — voir le log ajouté plus bas dans
    // index.js. Compromis accepté côté produit tant que le tier Groq n'est
    // pas upgradé.
    reasoning_effort: "default",
  });
}

/**
 * Version non-streaming, pour les cas où on a besoin d'une réponse JSON
 * complète d'un coup plutôt que d'un flux de tokens (génération/correction
 * d'exercices — voir POST /exercises/generate et /exercises/correct).
 * Retourne directement le texte JSON brut (à parser par l'appelant), pas
 * un objet déjà parsé, pour rester symétrique avec generateAIResponse du
 * monolithe d'origine.
 *
 * reasoningEffort ("default" ou "none", seules valeurs acceptées par Qwen3)
 * est pilotable par l'appelant plutôt que fixé en dur, pour permettre
 * l'approche en deux appels utilisée par /exercises/generate et
 * /exercises/correct (voir index.js) :
 *  - "default" : raisonnement interne actif, utile pour un appel de
 *    vérification silencieuse dont la sortie visible attendue est courte
 *    (le budget max_tokens sert surtout au raisonnement caché).
 *  - "none" : pas de raisonnement caché, tout le budget max_tokens va à la
 *    sortie visible — utilisé pour l'appel de rédaction finale, une fois
 *    les paramètres déjà vérifiés par le premier appel, qui n'a donc plus
 *    besoin de re-vérifier la cohérence en interne.
 * Le plancher de budget appliqué par computeMaxTokens est plus bas pour
 * "none" (MIN_MAX_TOKENS_NO_REASONING) puisqu'il n'y a pas de raisonnement
 * caché à financer avant la sortie visible.
 */
export async function generateJSON(
  messages,
  { temperature = 0.7, maxTokens = 6000, reasoningEffort = "default" } = {}
) {
  const client = getGroqClient();
  const minMaxTokens = reasoningEffort === "none" ? MIN_MAX_TOKENS_NO_REASONING : MIN_MAX_TOKENS;
  const finalMaxTokens = computeMaxTokens(messages, maxTokens, minMaxTokens);

  const completion = await client.chat.completions.create({
    model: "qwen/qwen3.6-27b",
    messages,
    temperature,
    max_tokens: finalMaxTokens,
    stream: false,
    response_format: { type: "json_object" },
    reasoning_format: "hidden",
    reasoning_effort: reasoningEffort,
  });

  return completion.choices[0]?.message?.content ?? "";
}
