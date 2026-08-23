import Groq from "groq-sdk";
import { buildCurriculumContext } from "@/lib/curriculum";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export function getAIProvider(): "groq" | "openai" | "none" {
  if (process.env.GROQ_API_KEY) return "groq";
  if (process.env.OPENAI_API_KEY) return "openai";
  return "none";
}

export async function generateAIResponse(
  messages: ChatMessage[],
  options: { temperature?: number; maxTokens?: number; jsonMode?: boolean } = {}
): Promise<string> {
  const { temperature = 0.7, maxTokens = 2000, jsonMode = false } = options;
  const provider = getAIProvider();

  if (provider === "none") {
    throw new Error("NO_API_KEY");
  }

  if (provider === "groq") {
    const response = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages,
      temperature,
      max_tokens: maxTokens,
      ...(jsonMode ? { response_format: { type: "json_object" as const } } : {}),
    });
    return response.choices[0]?.message?.content ?? "";
  }

  // OpenAI fallback
  const { default: openai } = await import("@/lib/openai");
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages,
    temperature,
    max_tokens: maxTokens,
    ...(jsonMode ? { response_format: { type: "json_object" as const } } : {}),
  });
  return response.choices[0]?.message?.content ?? "";
}

export async function streamAIResponse(
  messages: ChatMessage[],
  options: { temperature?: number; maxTokens?: number } = {}
) {
  const { temperature = 0.7, maxTokens = 2000 } = options;
  const provider = getAIProvider();

  if (provider === "none") {
    throw new Error("NO_API_KEY");
  }

  if (provider === "groq") {
    return groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages,
      temperature,
      max_tokens: maxTokens,
      stream: true,
    });
  }

  // OpenAI fallback
  const { default: openai } = await import("@/lib/openai");
  return openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages,
    temperature,
    max_tokens: maxTokens,
    stream: true,
  });
}

export function buildSystemPrompt(
  gradeLevel?: string | null,
  subject?: string | null,
  mode: string = "CHAT",
  lessonContext?: string | null,
  scrapedContext?: string | null,
  serie?: string | null
): string {
  const levelText = gradeLevel
    ? `L'élève est en classe de ${gradeLevel}.`
    : "Le niveau scolaire n'est pas encore précisé.";

  const subjectText = subject
    ? `La matière étudiée est : ${subject}.`
    : "Aucune matière spécifique n'est sélectionnée.";

  const contextBlock = lessonContext
    ? `\n\nVoici le contenu de la leçon pertinente :\n---\n${lessonContext}\n---\nUtilise ces informations pour formuler ta réponse.`
    : "";

  const scrapedBlock = scrapedContext
    ? `\n\nVoici des informations complémentaires récupérées depuis des sources éducatives ivoiriennes :\n---\n${scrapedContext}\n---\nUtilise ces informations pour enrichir et compléter ta réponse. Cite les sources quand c'est pertinent.`
    : "";

  const modeInstructions: Record<string, string> = {
    CHAT: `Tu es un assistant éducatif. Réponds aux questions de l'élève de manière claire, pédagogique et adaptée à son niveau.`,
    EXERCISE: `Tu es un générateur d'exercices. Crée des exercices adaptés au niveau de l'élève avec des questions claires. Fournis toujours la correction détaillée après chaque exercice.`,
    CORRECTION: `Tu es un correcteur pédagogique. Corrige le travail de l'élève étape par étape, explique les erreurs, et donne une note sur 20. Sois encourageant tout en étant précis.`,
    QUIZ: `Tu es un créateur de quiz. Génère des questions à choix multiples (QCM) avec 4 options et indique la bonne réponse avec une explication.`,
    REVISION: `Tu es un assistant de révision. Résume les leçons, propose des fiches de révision, et aide l'élève à mémoriser les points clés.`,
  };

  const modeText = modeInstructions[mode] ?? modeInstructions.CHAT;

  const curriculumBlock = buildCurriculumContext(gradeLevel, subject, serie);

  return `${modeText}

Tu es un assistant éducatif intelligent conçu spécialement pour les élèves ivoiriens, basé sur le programme officiel du Ministère de l'Éducation Nationale et de l'Alphabétisation de Côte d'Ivoire (MENA/DPFC).
Tu dois toujours répondre en français, de manière claire et pédagogique.
${levelText}
${subjectText}

=== PROGRAMME SCOLAIRE IVOIRIEN (à suivre strictement) ===
${curriculumBlock}
=== FIN DU PROGRAMME ===

Règles importantes :
- Suis STRICTEMENT le programme ivoirien (APC) ci-dessus : ne traite pas de notions hors-programme pour le niveau de l'élève.
- Emploie le vocabulaire de l'Approche Par les Compétences (compétence, habileté, situation d'apprentissage/d'évaluation).
- Ancre TOUS tes exemples dans le contexte ivoirien (FCFA, villes ivoiriennes, cacao/café, auteurs ivoiriens, prénoms locaux). N'utilise jamais l'euro ou le dollar.
- Prépare l'élève à l'examen national de son cycle (CEPE, BEPC ou BAC selon le cas) et au format des épreuves ivoiriennes.
- Adapte ton langage : primaire = mots simples et exemples ludiques ; collège = vocabulaire technique progressif ; lycée = rigueur et vocabulaire académique (en tenant compte de la série A/C/D).
- Si l'élève demande de l'aide sans vouloir la réponse directe, donne des indices progressifs.
- Encourage toujours l'élève et valorise ses efforts.
- Structure tes réponses avec des titres, des listes et des étapes claires ; pour les mathématiques, montre les étapes de calcul détaillées.
- Ne donne JAMAIS de réponses inappropriées ou hors du cadre éducatif.
- Quand tu disposes d'informations provenant de sources éducatives, intègre-les naturellement et cite la source.${contextBlock}${scrapedBlock}`;
}
