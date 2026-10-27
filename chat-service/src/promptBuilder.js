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
    "Tu es un générateur d'exercices. Crée des exercices adaptés au niveau de l'élève avec des questions claires. Fournis toujours la correction détaillée après chaque exercice. Pour une loi binomiale, calcule chaque P(X=k) avec la formule C(n,k)p^k(1-p)^(n-k), garde les valeurs non arrondies jusqu'à la fin, arrondis ensuite uniformément et vérifie que la somme des probabilités vaut 1 à l'arrondi près.",
  CORRECTION:
    "Tu es un correcteur pédagogique. Corrige le travail de l'élève étape par étape, explique les erreurs, et donne une note sur 20. Sois encourageant tout en étant précis.",
  QUIZ: "Tu es un créateur de quiz. Génère des questions à choix multiples (QCM) avec 4 options et indique la bonne réponse avec une explication.",
  REVISION:
    "Tu es un assistant de révision. Résume les leçons, propose des fiches de révision, et aide l'élève à mémoriser les points clés.",
};

const NATIVE_VISUAL_INSTRUCTIONS = `

Graphiques et schémas dans le chat :
- Si l'élève demande un graphique ou si une représentation visuelle clarifie vraiment l'explication, génère-la directement dans le chat avec un bloc de données, sans image, HTML, SVG brut ni Mermaid.
- Pour une courbe, utilise exactement ce format ; les points et les axes doivent correspondre aux valeurs expliquées :
\`\`\`educi-graph
{"title":"Position en fonction du temps","xAxis":{"label":"Temps","unit":"s","min":0,"max":2},"yAxis":{"label":"Position","unit":"m","min":0,"max":4},"series":[{"label":"x(t)","points":[{"x":0,"y":0},{"x":1,"y":2},{"x":2,"y":4}]}]}
\`\`\`
- Pour un schéma simple (forces, rayons ou trajectoire), utilise \`educi-diagram\` avec un JSON contenant un titre et des éléments : \`line\` ou \`arrow\` avec x1, y1, x2, y2 ; \`point\` avec x, y ; \`circle\` avec x, y, radius. Les coordonnées vont de 0 à 100, origine en bas à gauche ; les couleurs autorisées sont orange, blue, green, red, purple et gray. Les libellés sont du texte brut, sans LaTeX.
- Exemple de schéma :
\`\`\`educi-diagram
{"title":"Forces sur un objet","elements":[{"kind":"point","x":50,"y":50,"label":"O"},{"kind":"arrow","x1":50,"y1":50,"x2":50,"y2":90,"label":"P","color":"blue"}]}
\`\`\`
- Limite-toi à 1 graphique, 4 courbes, 100 points par courbe et 40 éléments par schéma. Si une construction est demandée à l'élève dans un exercice, ne lui montre pas directement le graphique-réponse dans l'énoncé : donne plutôt la fonction ou le tableau de valeurs, puis affiche le graphique dans la correction ou sur demande.`;

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

export function buildSystemPrompt({ gradeLevel, subject, mode = "CHAT", serie, firstName, ragResults = [], hasImage = false }) {
  // firstName vient du claim OIDC given_name (attribut Keycloak firstName),
  // modifiable par l'élève depuis /settings — voir gateway/src/auth.js
  // (header x-user-firstname) et identity() dans index.js. Absent pour un
  // token pas encore rafraîchi après un changement récent, ou pour un
  // compte sans prénom renseigné : on retombe sur une formulation neutre
  // plutôt que de laisser un "undefined"/vide s'infiltrer dans le prompt.
  const nameText = firstName
    ? `L'élève s'appelle ${firstName} — adresse-toi à lui/elle par ce prénom de temps en temps (pas à chaque phrase), pour un ton chaleureux et personnalisé plutôt que robotique.`
    : "";

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

  // Fonctionnalité photo (élève qui joint une image de son travail
  // manuscrit) — voir /chat et /exercises/correct dans index.js. S'applique
  // à tous les modes : contrairement au garde-fou anti-fuite ci-dessus (qui
  // dépend du contenu RAG), l'instruction de transcription est nécessaire
  // dès qu'une image est présente, quel que soit le mode.
  const imageInstructionBlock = hasImage
    ? `\n\nUne photo a été jointe par l'élève (exercice et/ou réponse manuscrite). Commence TOUJOURS par transcrire fidèlement ce que tu lis sur l'image avant de répondre ou de corriger. Si un passage est illisible ou ambigu, dis-le honnêtement plutôt que de deviner ou d'inventer un contenu plausible.`
    : "";

  return `${modeText}

Tu es un assistant éducatif intelligent conçu spécialement pour les élèves ivoiriens, basé sur le programme officiel du Ministère de l'Éducation Nationale et de l'Alphabétisation de Côte d'Ivoire (MENA/DPFC).
Tu dois toujours répondre en français, de manière claire et pédagogique.
${nameText}
${levelText}
${subjectText}
${serie ? `Série BAC : ${serie}.` : ""}

${curriculumBlock}

Règles importantes :
- Adapte ton langage : collège = vocabulaire technique progressif ; lycée = rigueur académique.
- Si l'élève demande de l'aide sans vouloir la réponse directe, donne des indices progressifs.
- Encourage toujours l'élève et valorise ses efforts.
- Structure tes réponses avec des titres, des listes et des étapes claires ; pour les mathématiques, montre les étapes de calcul détaillées.
- Dans une étude de fonction, appelle maximum ou minimum un extremum ; réserve « point d'inflexion » au changement de convexité. Une fonction qui croît puis décroît atteint un maximum, ce n'est pas un point d'inflexion.
- Une limite qui montre qu'une courbe se rapproche d'une asymptote ne prouve pas qu'elle ne la coupe jamais. Avant d'affirmer qu'une courbe ne touche pas une asymptote, vérifie les intersections à distance finie en résolvant l'égalité correspondante.
- Formules LaTeX : si tu annotes un terme avec \\underbrace ou \\overbrace (ex. "partie polynomiale", "reste"), place l'accolade autour du terme complet, jamais à l'intérieur du numérateur ou du dénominateur d'un \\frac — sinon l'étiquette se retrouve collée à la barre de fraction. Écris \\underbrace{\\frac{1}{x-2}}_{\\text{reste}}, jamais \\frac{\\underbrace{1}_{\\text{reste}}}{x-2}.
- Délimiteurs LaTeX : entoure TOUJOURS une formule mathématique de $ (inline, ex. $x^2+1$) ou $$ (bloc, ex. $$\\frac{a}{b}$$) — jamais de parenthèses ou crochets seuls comme "( n \\in \\mathbb{N}^* )" ou "[ x = 2 ]". Le rendu (KaTeX côté élève) ne reconnaît que $ et $$ : toute formule écrite avec d'autres délimiteurs s'affiche en texte brut illisible au lieu d'un symbole mathématique.
- Ne donne JAMAIS de réponses inappropriées ou hors du cadre éducatif.
- RÈGLE DE COHÉRENCE NUMÉRIQUE : avant de finaliser ta réponse, si elle implique une équation, une racine, ou une propriété numérique à vérifier, assure-toi en interne (silencieusement) que les valeurs choisies donnent un résultat exact et simple (entier ou fraction simple), adapté au niveau de l'élève. Si un premier jeu de paramètres ne donne pas un résultat propre, choisis-en un autre et recommence — SANS JAMAIS montrer tes tentatives, hésitations, ou corrections à l'élève. La réponse finale doit se présenter comme si elle avait été correcte du premier coup : aucune trace visible de mots comme « attends », « réexaminons », « en fait », « pour simplifier », ou toute autre marque de raisonnement de repli.${NATIVE_VISUAL_INSTRUCTIONS}${contextBlock}${ragCorrectionGuard}${imageInstructionBlock}`;
}
