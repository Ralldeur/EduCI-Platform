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
 *
 * QUIZ interroge "cours" (pas "exercice") depuis le 2026-09-03 : la base
 * ne contient quasiment aucun document taggé "exercice" (1 seul chunk pour
 * toute la matière maths/TLE), alors que les leçons "cours" ingérées sont
 * riches et couvrent le programme — voir audit RAG du même jour. Un quiz
 * généré contre "exercice" n'avait donc presque jamais de contenu réel à
 * exploiter et inventait ses questions de toutes pièces. Comme pour
 * CHAT/REVISION, ce choix expose QUIZ au risque de fuite de corrigé
 * (exercices résolus mêlés au cours dans les mêmes chunks) — voir
 * ragCorrectionGuard ci-dessous, qui s'applique donc aussi à QUIZ.
 */
export function docTypeForMode(mode) {
  return ["EXERCISE", "CORRECTION"].includes(mode) ? "exercice" : "cours";
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

  // Garde-fou anti-fuite de corrigés — modes CHAT, REVISION et QUIZ.
  //
  // Constat (audit RAG, 2026-09-03) : les 5 leçons de maths Terminale D
  // ingérées depuis ecole-ci.org (limites, dérivabilité, complexes,
  // suites, statistiques), toutes taguées docType="cours", contiennent en
  // réalité des sections "Exercice de fixation" / "EXERCICES RÉSOLUS"
  // suivies immédiatement de leur "Solution"/"Réponse" rédigée en clair,
  // dans les MÊMES chunks que le cours. Le filtre docType (docTypeForMode
  // ci-dessus) empêche bien de récupérer des documents taggés "exercice"
  // en mode CHAT/REVISION/QUIZ, mais ne protège pas contre un corrigé caché
  // à l'intérieur d'un chunk taggé "cours" — ce garde-fou comble ce trou.
  //
  // S'applique à CHAT, REVISION et QUIZ (les trois interrogent
  // docType="cours" — voir docTypeForMode — et sont donc exposés au même
  // risque : pour QUIZ, sans ce garde-fou, le corrigé d'un "Exercice de
  // fixation" retrouvé dans le cours pourrait fuiter tel quel comme
  // question/réponse du quiz généré). Ne s'applique PAS à EXERCISE/
  // CORRECTION : y révéler une réponse (à la fin d'une correction, ou dans
  // un corrigé généré) est le comportement attendu, pas une fuite.
  const ragCorrectionGuard =
    ["CHAT", "REVISION", "QUIZ"].includes(mode) && ragResults.length > 0
      ? `\n\nRÈGLE ANTI-FUITE DE CORRIGÉ (mode ${mode}) : certains extraits de cours ci-dessus peuvent contenir des exercices accompagnés de leur solution/corrigé/réponse déjà entièrement rédigée. Si c'est le cas, NE RECOPIE JAMAIS cette solution telle quelle (verbatim ou quasi verbatim) et NE DONNE JAMAIS directement "la réponse est X". Explique plutôt la notion et la démarche avec tes propres mots, comme pour une question de cours. Si l'élève demande explicitement la réponse ou le corrigé d'un exercice, refuse de la lui donner brute : explique la méthode et guide-le avec des indices progressifs vers la solution, sans jamais citer le corrigé trouvé dans le contexte.`
      : "";

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
- Formules LaTeX : si tu annotes un terme avec \\underbrace ou \\overbrace (ex. "partie polynomiale", "reste"), place l'accolade autour du terme complet, jamais à l'intérieur du numérateur ou du dénominateur d'un \\frac — sinon l'étiquette se retrouve collée à la barre de fraction. Écris \\underbrace{\\frac{1}{x-2}}_{\\text{reste}}, jamais \\frac{\\underbrace{1}_{\\text{reste}}}{x-2}.
- Ne donne JAMAIS de réponses inappropriées ou hors du cadre éducatif.
- RÈGLE DE COHÉRENCE NUMÉRIQUE : avant de finaliser ta réponse, si elle implique une équation, une racine, ou une propriété numérique à vérifier, assure-toi en interne (silencieusement) que les valeurs choisies donnent un résultat exact et simple (entier ou fraction simple), adapté au niveau de l'élève. Si un premier jeu de paramètres ne donne pas un résultat propre, choisis-en un autre et recommence — SANS JAMAIS montrer tes tentatives, hésitations, ou corrections à l'élève. La réponse finale doit se présenter comme si elle avait été correcte du premier coup : aucune trace visible de mots comme « attends », « réexaminons », « en fait », « pour simplifier », ou toute autre marque de raisonnement de repli.${contextBlock}${ragCorrectionGuard}`;
}
