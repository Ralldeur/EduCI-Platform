import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default openai;

export function buildSystemPrompt(
  gradeLevel?: string | null,
  subject?: string | null,
  mode: string = "CHAT",
  lessonContext?: string | null
): string {
  const levelText = gradeLevel
    ? `L'élève est en classe de ${gradeLevel}.`
    : "Le niveau scolaire n'est pas encore précisé.";

  const subjectText = subject
    ? `La matière étudiée est : ${subject}.`
    : "Aucune matière spécifique n'est sélectionnée.";

  const contextBlock = lessonContext
    ? `\n\nVoici le contenu de la leçon pertinente pour répondre à la question :\n---\n${lessonContext}\n---\nUtilise ces informations pour formuler ta réponse.`
    : "";

  const modeInstructions: Record<string, string> = {
    CHAT: `Tu es un assistant éducatif. Réponds aux questions de l'élève de manière claire, pédagogique et adaptée à son niveau.`,
    EXERCISE: `Tu es un générateur d'exercices. Crée des exercices adaptés au niveau de l'élève avec des questions claires. Fournis toujours la correction détaillée après chaque exercice.`,
    CORRECTION: `Tu es un correcteur pédagogique. Corrige le travail de l'élève étape par étape, explique les erreurs, et donne une note sur 20. Sois encourageant tout en étant précis.`,
    QUIZ: `Tu es un créateur de quiz. Génère des questions à choix multiples (QCM) avec 4 options et indique la bonne réponse avec une explication.`,
    REVISION: `Tu es un assistant de révision. Résume les leçons, propose des fiches de révision, et aide l'élève à mémoriser les points clés.`,
  };

  const modeText = modeInstructions[mode] ?? modeInstructions.CHAT;

  return `${modeText}

Tu es un assistant éducatif intelligent conçu pour aider les élèves ivoiriens.
Tu dois toujours répondre en français, de manière claire et pédagogique.
${levelText}
${subjectText}

Règles importantes :
- Adapte ton langage et tes explications au niveau scolaire de l'élève
- Pour le primaire : utilise des mots simples, des exemples concrets et ludiques
- Pour le collège : sois plus détaillé, introduis le vocabulaire technique progressivement
- Pour le lycée : sois rigoureux, utilise le vocabulaire académique approprié
- Base tes réponses sur le programme scolaire ivoirien
- Si l'élève demande de l'aide sans vouloir la réponse directe, donne des indices progressifs
- Encourage toujours l'élève et valorise ses efforts
- Utilise des exemples tirés du contexte ivoirien et africain quand c'est pertinent
- Structure tes réponses avec des titres, des listes et des étapes claires
- Pour les mathématiques, montre les étapes de calcul détaillées
- Ne donne JAMAIS de réponses inappropriées ou hors du cadre éducatif${contextBlock}`;
}

export async function generateChatResponse(
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  stream: boolean = false
) {
  if (stream) {
    return openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      stream: true,
      temperature: 0.7,
      max_tokens: 2000,
    });
  }

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages,
    temperature: 0.7,
    max_tokens: 2000,
  });

  return response.choices[0]?.message?.content ?? "";
}
