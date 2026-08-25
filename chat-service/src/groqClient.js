import Groq from "groq-sdk";

let groq;

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

  return client.chat.completions.create({
    model: "qwen/qwen3.6-27b",
    messages,
    temperature,
    max_tokens: maxTokens,
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
 */
export async function generateJSON(messages, { temperature = 0.7, maxTokens = 6000 } = {}) {
  const client = getGroqClient();

  const completion = await client.chat.completions.create({
    model: "qwen/qwen3.6-27b",
    messages,
    temperature,
    max_tokens: maxTokens,
    stream: false,
    response_format: { type: "json_object" },
    reasoning_format: "hidden",
    reasoning_effort: "default",
  });

  return completion.choices[0]?.message?.content ?? "";
}
