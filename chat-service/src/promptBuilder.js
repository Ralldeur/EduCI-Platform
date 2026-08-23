// Adapté de src/lib/ai.ts (buildSystemPrompt) du monolithe Next.js, avec le
// RAG (ml-service) à la place des lessons Prisma + du scraping.
//
// Le programme scolaire ivoirien détaillé (APC, examens, chapitres par
// matière/niveau) est porté depuis src/lib/curriculum.ts — voir curriculum.js
// dans ce même dossier. Le bloc IVORIAN_CONTEXT qu'il fournit est plus riche
// que l'ancrage générique utilisé auparavant ici ; on ne garde qu'une seule
// version pour éviter le doublon et limiter la taille du prompt (voir
// l'historique de dépassement TPM avec openai/gpt-oss-120b).
//
// ATTENTION FORMAT : buildCurriculumContext() attend gradeLevel au format
// abrégé du monolithe ("TLE", "2NDE", "1ERE", "6EME"...), pas un libellé
// complet comme "Terminale D". Si gradeLevel vient de Keycloak (attribut
// grade_level actuellement au format "Terminale D"), il faudra le convertir
// avant l'appel — sinon getChapters() ne trouvera silencieusement aucun
// chapitre et le bloc "Programme officiel de ..." sera simplement omis.

import { buildCurriculumContext } from "./curriculum.js";

const MODE_INSTRUCTIONS = {
  CHAT: "Tu es un assistant éducatif. Réponds aux questions de l'élève de manière claire, pédagogique et adaptée à son niveau.",
  EXERCISE:
    "Tu es un générateur d'exercices. Crée des exercices adaptés au niveau de l'élève avec des questions claires. Fournis toujours la correction détaillée après chaque exercice.",
  CORRECTION:
    "Tu es un correcteur pédagogique. Corrige le travail de l'élève étape par étape, explique les erreurs, et donne une note sur 20. Sois encourageant tout en étant précis.",
  QUIZ: "Tu es un créateur de quiz. Génère des questions à choix multiples (QCM) avec 4 options et indique la bonne réponse avec une explication.",
  REVISION:
    "Tu es un assistant de révision. Résume les leçons, propose des fiches de révision, et aide l'élève à mémoriser les points clés.",
};

/**
 * Détermine quel docType interroger dans le RAG selon le mode de la
 * conversation. Règle produit non négociable : un mode d'explication
 * (CHAT, REVISION) ne doit jamais voir remonter des exercices dans son
 * contexte, et inversement.
 */
export function docTypeForMode(mode) {
  return ["EXERCISE", "QUIZ", "CORRECTION"].includes(mode) ? "exercice" : "cours";
}

export function buildSystemPrompt({ gradeLevel, subject, mode = "CHAT", serie, ragResults = [] }) {
  const levelText = gradeLevel
    ? `L'élève est en classe de ${gradeLevel}.`
    : "Le niveau scolaire n'est pas encore précisé.";

  const subjectText = subject
    ? `La matière étudiée est : ${subject}.`
    : "Aucune matière spécifique n'est sélectionnée.";

  const contextBlock =
    ragResults.length > 0
      ? `\n\nVoici des extraits de cours/exercices pertinents fournis par l'établissement :\n---\n${ragResults
          .map((r) => `## ${r.title}\n${r.text}`)
          .join("\n\n")}\n---\nAppuie-toi PRIORITAIREMENT sur ces extraits pour formuler ta réponse.`
      : "";

  const modeText = MODE_INSTRUCTIONS[mode] ?? MODE_INSTRUCTIONS.CHAT;

  // Programme scolaire ivoirien (APC, examen national, chapitres officiels
  // MENA/DPFC pour la matière/niveau donnés). Remplace l'ancien bloc générique
  // "Ancre TOUJOURS tes exemples..." par une version plus riche et plus
  // précise (voir curriculum.js).
  const curriculumBlock = buildCurriculumContext(gradeLevel, subject, serie);

  return `${modeText}

Tu es un assistant éducatif intelligent conçu spécialement pour les élèves ivoiriens, basé sur le programme officiel du Ministère de l'Éducation Nationale et de l'Alphabétisation de Côte d'Ivoire (MENA/DPFC).
Tu dois toujours répondre en français, de manière claire et pédagogique.
${levelText}
${subjectText}
${serie ? `Série BAC : ${serie}.` : ""}

${curriculumBlock}

Règles importantes :
- Adapte ton langage : collège = vocabulaire technique progressif ; lycée = rigueur académique.
- Si l'élève demande de l'aide sans vouloir la réponse directe, donne des indices progressifs.
- Encourage toujours l'élève et valorise ses efforts.
- Structure tes réponses avec des titres, des listes et des étapes claires ; pour les mathématiques, montre les étapes de calcul détaillées.
- Ne donne JAMAIS de réponses inappropriées ou hors du cadre éducatif.${contextBlock}`;
}
