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
export async function streamAIResponse(messages, { temperature = 0.7, maxTokens = 2000 } = {}) {
  const client = getGroqClient();

    return client.chat.completions.create({
    model: "qwen/qwen3.6-27b",
    messages,
    temperature,
    max_tokens: maxTokens,
    stream: true,
    reasoning_format: "hidden",
    reasoning_effort: "none",
  });
}
