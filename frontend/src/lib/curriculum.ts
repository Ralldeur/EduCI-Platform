/**
 * Programme scolaire officiel ivoirien (Approche Par les Compétences - APC)
 *
 * Source : Ministère de l'Éducation Nationale et de l'Alphabétisation (MENA),
 * Direction de la Pédagogie et de la Formation Continue (DPFC).
 * Les programmes éducatifs ivoiriens sont structurés selon l'APC depuis 2003.
 *
 * Ce module est l'unique source de vérité du programme : il est utilisé à la
 * fois pour construire le prompt de l'IA (buildSystemPrompt) et pour remplir la
 * base de données (prisma/seed.ts), afin que l'assistant suive strictement le
 * programme ivoirien plutôt qu'un contenu générique.
 */

export type Cycle = "PRIMAIRE" | "COLLEGE" | "LYCEE";

/** Vocabulaire officiel de l'Approche Par les Compétences (APC). */
export const APC_FRAMEWORK = `L'enseignement en Côte d'Ivoire suit l'Approche Par les Compétences (APC).
Vocabulaire à employer : « compétence », « habileté », « contenu », « situation d'apprentissage »,
« situation d'évaluation » et « situation complexe ». L'élève est placé au centre des apprentissages :
on part d'une situation concrète de la vie courante ivoirienne, on installe des habiletés, puis on
évalue par une situation. L'année scolaire compte 31 semaines (régime pédagogique du MENA).`;

/** Contexte ivoirien à mobiliser systématiquement dans les exemples. */
export const IVORIAN_CONTEXT = `Ancre TOUJOURS tes exemples dans le contexte ivoirien :
- Monnaie : le franc CFA (FCFA), jamais l'euro ni le dollar.
- Villes et lieux : Abidjan (capitale économique), Yamoussoukro (capitale politique), Bouaké,
  Korhogo, San-Pédro, Daloa, Man, le fleuve Bandama, le pont HKB, le marché de Treichville.
- Économie : cacao, café, anacarde, hévéa, coton, le Port Autonome d'Abidjan.
- Histoire/Société : Félix Houphouët-Boigny (1er président), l'indépendance du 7 août 1960,
  le PDCI, l'OUA ; fêtes et réalités locales.
- Français/Littérature : privilégie les auteurs ivoiriens et africains — Bernard Dadié,
  Ahmadou Kourouma, Bernard Zadi Zaourou, Jean-Marie Adiaffi, Véronique Tadjo, Werewere Liking.
- Vie quotidienne : prénoms et noms ivoiriens (Aya, Koffi, Kouassi, Konan, Adjoua, Yao, Aké),
  attiéké, foutou, le gbaka, la tontine, le mobile money (Wave, Orange Money, MTN MoMo).`;

/** Examens nationaux ivoiriens par cycle. */
export const IVORIAN_EXAMS: Record<Cycle, { name: string; full: string; classe: string; note: string }> = {
  PRIMAIRE: {
    name: "CEPE",
    full: "Certificat d'Études Primaires Élémentaires",
    classe: "CM2",
    note: "Passé en fin de CM2, couplé au concours d'Entrée en 6ème. Épreuves notées /20.",
  },
  COLLEGE: {
    name: "BEPC",
    full: "Brevet d'Études du Premier Cycle",
    classe: "3ème",
    note: "Passé en fin de 3ème (épreuves : français, mathématiques, sciences (PC + SVT), histoire-géographie, anglais, EPS). Géré par la DECO. Notes /20.",
  },
  LYCEE: {
    name: "BAC",
    full: "Baccalauréat",
    classe: "Terminale",
    note: "Passé en fin de Terminale selon la série (A, C, D…). Chaque matière a un coefficient propre à la série. Géré par la DECO. Notes /20.",
  },
};

/** Séries du lycée (enseignement général). */
export const LYCEE_SERIES = [
  { value: "A", label: "Série A (littéraire)", desc: "Lettres, philosophie, langues, histoire-géo. Sous-séries A1/A2." },
  { value: "C", label: "Série C (maths et sciences physiques)", desc: "Forte dominante mathématiques et physique-chimie." },
  { value: "D", label: "Série D (maths et sciences de la nature)", desc: "Dominante mathématiques, SVT et physique-chimie." },
] as const;

export function getCycle(gradeLevel: string): Cycle {
  if (["CP1", "CP2", "CE1", "CE2", "CM1", "CM2"].includes(gradeLevel)) return "PRIMAIRE";
  if (["6EME", "5EME", "4EME", "3EME"].includes(gradeLevel)) return "COLLEGE";
  return "LYCEE";
}

export type Chapter = { title: string; lessons: string[] };

/**
 * Chapitres du programme par matière puis par niveau. Les intitulés suivent les
 * programmes éducatifs du MENA/DPFC (profils de sortie et progressions APC).
 */
export const CURRICULUM: Record<string, Partial<Record<string, Chapter[]>>> = {
  mathematiques: {
    "6EME": [
      { title: "Arithmétique : les nombres entiers naturels", lessons: ["Nombres entiers naturels", "Opérations (addition, soustraction, multiplication, division euclidienne)", "Multiples et diviseurs, critères de divisibilité"] },
      { title: "Les nombres décimaux", lessons: ["Écriture et comparaison des nombres décimaux", "Opérations sur les décimaux", "Fractions et fractions décimales"] },
      { title: "Géométrie plane", lessons: ["Droites, demi-droites, segments", "Cercle", "Angles", "Triangles et quadrilatères usuels"] },
      { title: "Symétrie orthogonale", lessons: ["Symétrique d'un point, d'une figure", "Médiatrice, bissectrice"] },
      { title: "Grandeurs et mesures", lessons: ["Périmètres et aires", "Unités de longueur, de masse, de durée", "Volume du pavé droit"] },
      { title: "Organisation de données", lessons: ["Proportionnalité", "Tableaux et représentations"] },
    ],
    "5EME": [
      { title: "Nombres en écriture fractionnaire", lessons: ["Comparaison, addition et soustraction de fractions", "Multiplication de fractions"] },
      { title: "Nombres relatifs", lessons: ["Repérage et comparaison", "Addition et soustraction des nombres relatifs"] },
      { title: "Calcul littéral", lessons: ["Expressions littérales", "Distributivité, développement et factorisation simples"] },
      { title: "Proportionnalité", lessons: ["Pourcentages", "Échelles", "Vitesse moyenne"] },
      { title: "Géométrie : triangles", lessons: ["Somme des angles d'un triangle", "Droites remarquables", "Symétrie centrale"] },
      { title: "Parallélogrammes", lessons: ["Propriétés des parallélogrammes", "Parallélogrammes particuliers"] },
      { title: "Statistique", lessons: ["Effectifs, fréquences", "Diagrammes"] },
    ],
    "4EME": [
      { title: "Nombres rationnels", lessons: ["Opérations sur les rationnels", "Puissances d'exposant entier relatif"] },
      { title: "Calcul littéral et équations", lessons: ["Développement et factorisation", "Identités remarquables (introduction)", "Équations du premier degré à une inconnue"] },
      { title: "Théorème de Pythagore", lessons: ["Énoncé et calcul de longueurs", "Réciproque de Pythagore"] },
      { title: "Théorème de Thalès (proportionnalité)", lessons: ["Droite des milieux", "Configuration de Thalès"] },
      { title: "Cosinus d'un angle aigu", lessons: ["Définition et utilisation dans le triangle rectangle"] },
      { title: "Translation et vecteurs (introduction)", lessons: ["Translation", "Notion de vecteur"] },
      { title: "Statistique", lessons: ["Moyenne", "Regroupement en classes"] },
    ],
    "3EME": [
      { title: "Calcul numérique", lessons: ["Racines carrées", "Puissances", "Calculs dans ℕ, ℤ, ⅅ et ℚ"] },
      { title: "Calcul littéral", lessons: ["Identités remarquables", "Développement, factorisation", "Équations et inéquations du premier degré"] },
      { title: "Systèmes d'équations", lessons: ["Système de deux équations à deux inconnues", "Résolution de problèmes"] },
      { title: "Théorème de Thalès", lessons: ["Théorème de Thalès et réciproque", "Agrandissement et réduction"] },
      { title: "Trigonométrie", lessons: ["Sinus, cosinus, tangente d'un angle aigu", "Relations trigonométriques"] },
      { title: "Théorème de Pythagore (approfondissement)", lessons: ["Distances", "Cercle et angle inscrit"] },
      { title: "Vecteurs et translations", lessons: ["Somme de vecteurs", "Coordonnées d'un vecteur"] },
      { title: "Statistique", lessons: ["Moyenne, médiane, étendue", "Caractéristiques de position"] },
    ],
    "2NDE": [
      { title: "Calcul dans ℝ", lessons: ["Ensembles de nombres", "Intervalles, valeur absolue", "Ordre et opérations"] },
      { title: "Polynômes et fractions rationnelles", lessons: ["Polynômes du second degré", "Factorisation"] },
      { title: "Équations et inéquations", lessons: ["Équations et inéquations du second degré", "Systèmes"] },
      { title: "Géométrie analytique", lessons: ["Repère du plan", "Équations de droites", "Vecteurs et colinéarité"] },
      { title: "Statistique et probabilités", lessons: ["Statistique à une variable", "Dénombrement (introduction)"] },
    ],
    "1ERE": [
      { title: "Second degré", lessons: ["Forme canonique, discriminant", "Signe du trinôme"] },
      { title: "Études de fonctions", lessons: ["Limites et continuité (introduction)", "Dérivation", "Sens de variation"] },
      { title: "Suites numériques", lessons: ["Suites arithmétiques", "Suites géométriques"] },
      { title: "Trigonométrie", lessons: ["Cercle trigonométrique", "Formules d'addition"] },
      { title: "Probabilités et statistiques", lessons: ["Probabilité conditionnelle (D)", "Statistique à deux variables"] },
    ],
    "TLE": [
      { title: "Limites et continuité", lessons: ["Calcul de limites", "Théorèmes de continuité"] },
      { title: "Dérivabilité et étude de fonctions", lessons: ["Dérivées", "Étude complète et courbes"] },
      { title: "Fonctions logarithme et exponentielle", lessons: ["Fonction ln", "Fonction exp", "Équations et croissances comparées"] },
      { title: "Primitives et intégrales", lessons: ["Primitives", "Calcul intégral et aires"] },
      { title: "Suites numériques", lessons: ["Convergence", "Raisonnement par récurrence"] },
      { title: "Nombres complexes (C/D)", lessons: ["Forme algébrique et trigonométrique", "Module et argument"] },
      { title: "Probabilités", lessons: ["Variables aléatoires", "Lois de probabilité"] },
    ],
  },

  "physique-chimie": {
    "6EME": [
      { title: "L'eau dans notre environnement", lessons: ["États de la matière", "Changements d'état"] },
      { title: "L'air qui nous entoure", lessons: ["Existence et propriétés de l'air"] },
      { title: "Électricité (initiation)", lessons: ["Circuit électrique simple", "Conducteurs et isolants"] },
    ],
    "5EME": [
      { title: "L'eau : mélanges et solutions", lessons: ["Mélanges homogènes et hétérogènes", "Solubilité"] },
      { title: "Le circuit électrique", lessons: ["Circuit en série et en dérivation", "Sécurité électrique"] },
      { title: "La lumière", lessons: ["Sources et propagation de la lumière", "Ombres"] },
    ],
    "4EME": [
      { title: "Constitution de la matière", lessons: ["Atomes, molécules, ions", "La molécule d'eau"] },
      { title: "Les combustions", lessons: ["Combustion du carbone", "Combustions et environnement"] },
      { title: "Électricité : tension et intensité", lessons: ["Intensité du courant", "Tension électrique"] },
      { title: "La lumière et les couleurs", lessons: ["Lumières colorées", "Réfraction"] },
    ],
    "3EME": [
      { title: "Les ions et le pH", lessons: ["Solutions acides, basiques, neutres", "Tests d'identification d'ions"] },
      { title: "Réactions chimiques", lessons: ["Équations-bilan", "Conservation de la masse"] },
      { title: "Énergie électrique", lessons: ["Puissance et énergie électriques", "Loi d'Ohm"] },
      { title: "Mécanique", lessons: ["Poids et masse", "Forces et mouvement"] },
    ],
    "2NDE": [
      { title: "Chimie : la matière", lessons: ["Atome et classification périodique", "Mole et quantité de matière"] },
      { title: "Mécanique", lessons: ["Mouvement et vitesse", "Forces"] },
      { title: "Optique", lessons: ["Lentilles minces", "Formation des images"] },
    ],
    "1ERE": [
      { title: "Chimie organique (introduction)", lessons: ["Les alcanes", "Les alcools"] },
      { title: "Solutions aqueuses", lessons: ["Concentration", "Réactions acido-basiques"] },
      { title: "Électricité", lessons: ["Champ et potentiel", "Condensateurs"] },
      { title: "Mécanique", lessons: ["Travail et énergie", "Énergie mécanique"] },
    ],
    "TLE": [
      { title: "Cinétique et équilibres chimiques", lessons: ["Vitesse de réaction", "Équilibre chimique"] },
      { title: "Acides et bases", lessons: ["pH et constantes d'acidité", "Dosages"] },
      { title: "Mécanique : lois de Newton", lessons: ["Mouvements dans un champ", "Mouvements de projectiles"] },
      { title: "Électromagnétisme", lessons: ["Champ magnétique", "Induction"] },
      { title: "Physique nucléaire", lessons: ["Radioactivité", "Réactions nucléaires"] },
    ],
  },

  svt: {
    "6EME": [
      { title: "L'environnement proche", lessons: ["Les composantes de l'environnement", "Le peuplement d'un milieu"] },
      { title: "Le monde vivant", lessons: ["Classification des êtres vivants", "Régimes alimentaires des animaux"] },
    ],
    "5EME": [
      { title: "La respiration", lessons: ["Respiration chez l'Homme et les animaux", "Respiration et milieux de vie"] },
      { title: "La nutrition des plantes", lessons: ["Besoins des végétaux", "Photosynthèse (introduction)"] },
    ],
    "4EME": [
      { title: "La reproduction", lessons: ["Reproduction humaine", "Reproduction des plantes à fleurs"] },
      { title: "Géologie : l'eau dans la nature", lessons: ["Cycle de l'eau", "Roches et sols"] },
    ],
    "3EME": [
      { title: "Le fonctionnement de l'organisme", lessons: ["La digestion et les nutriments", "La circulation sanguine", "La respiration et les échanges gazeux"] },
      { title: "Le système nerveux", lessons: ["Organisation du système nerveux", "Acte réflexe"] },
      { title: "La reproduction humaine", lessons: ["Appareils reproducteurs", "Contraception et IST/VIH-SIDA"] },
      { title: "Hygiène et santé", lessons: ["Maladies (paludisme, etc.)", "Prévention"] },
    ],
    "2NDE": [
      { title: "La cellule", lessons: ["Organisation cellulaire", "Composition chimique du vivant"] },
      { title: "Écologie", lessons: ["Écosystèmes", "Cycles de la matière"] },
    ],
    "1ERE": [
      { title: "La reproduction et l'hérédité", lessons: ["Méiose et fécondation", "Génétique (introduction)"] },
      { title: "Géologie", lessons: ["Tectonique des plaques", "Roches magmatiques"] },
    ],
    "TLE": [
      { title: "Génétique", lessons: ["Brassage génétique", "Génétique humaine"] },
      { title: "Immunologie", lessons: ["Réponses immunitaires", "VIH/SIDA et immunité"] },
      { title: "Géologie", lessons: ["Histoire géologique", "Ressources géologiques de la Côte d'Ivoire"] },
    ],
  },

  "histoire-geographie": {
    "6EME": [
      { title: "Histoire : les débuts de l'humanité", lessons: ["La préhistoire", "Les premières civilisations"] },
      { title: "Géographie : se repérer", lessons: ["Représenter la Terre", "Les grands ensembles de relief"] },
    ],
    "5EME": [
      { title: "Histoire : les grands empires", lessons: ["Les empires du Soudan occidental (Ghana, Mali, Songhaï)", "Le commerce transsaharien"] },
      { title: "Géographie : l'Afrique", lessons: ["Climats et végétation de l'Afrique", "Populations africaines"] },
    ],
    "4EME": [
      { title: "Histoire : traite négrière et colonisation", lessons: ["La traite atlantique", "La conquête coloniale de l'Afrique"] },
      { title: "Géographie : la Côte d'Ivoire", lessons: ["Relief, climat et hydrographie de la Côte d'Ivoire", "Les régions"] },
    ],
    "3EME": [
      { title: "Histoire : la Côte d'Ivoire coloniale et l'indépendance", lessons: ["La colonisation française", "Le RDA et la marche vers l'indépendance", "L'indépendance de 1960 et Houphouët-Boigny"] },
      { title: "Histoire : le monde au XXe siècle", lessons: ["Les deux guerres mondiales", "La décolonisation"] },
      { title: "Géographie : l'économie ivoirienne", lessons: ["L'agriculture (cacao, café, anacarde)", "Industrie, transports et le Port d'Abidjan"] },
    ],
    "2NDE": [
      { title: "Histoire : les grandes civilisations", lessons: ["L'Antiquité", "Le monde médiéval"] },
      { title: "Géographie : population et développement", lessons: ["Dynamiques de population", "Urbanisation en Afrique"] },
    ],
    "1ERE": [
      { title: "Histoire : le monde contemporain", lessons: ["Révolution industrielle", "Les colonisations et leurs conséquences"] },
      { title: "Géographie : la mondialisation", lessons: ["Les échanges mondiaux", "La Côte d'Ivoire dans la CEDEAO"] },
    ],
    "TLE": [
      { title: "Histoire : le monde depuis 1945", lessons: ["La guerre froide", "L'Afrique indépendante et la Côte d'Ivoire"] },
      { title: "Géographie : développement et environnement", lessons: ["Sous-développement et stratégies", "Enjeux environnementaux en Côte d'Ivoire"] },
    ],
  },

  francais: {
    "6EME": [
      { title: "Grammaire", lessons: ["Les types et formes de phrases", "Les classes de mots", "Le groupe nominal"] },
      { title: "Conjugaison", lessons: ["Le présent de l'indicatif", "Le passé composé"] },
      { title: "Lecture", lessons: ["Le conte (conte africain et ivoirien)", "Le récit"] },
      { title: "Expression écrite", lessons: ["Rédiger un récit simple"] },
    ],
    "5EME": [
      { title: "Grammaire", lessons: ["Les compléments", "La phrase complexe (introduction)"] },
      { title: "Conjugaison", lessons: ["L'imparfait et le passé simple", "Le futur"] },
      { title: "Lecture", lessons: ["Le récit d'aventure", "La poésie"] },
    ],
    "4EME": [
      { title: "Grammaire", lessons: ["Les propositions subordonnées", "Le discours rapporté"] },
      { title: "Lecture", lessons: ["La lettre", "Le théâtre", "Textes d'auteurs ivoiriens (Bernard Dadié)"] },
      { title: "Expression écrite", lessons: ["Le récit au passé", "L'argumentation (initiation)"] },
    ],
    "3EME": [
      { title: "Grammaire", lessons: ["Les types et formes de phrases", "Les valeurs des temps", "L'expression de la cause et de la conséquence"] },
      { title: "Lecture", lessons: ["Le roman (Ahmadou Kourouma)", "La poésie engagée africaine", "L'autobiographie"] },
      { title: "Expression écrite", lessons: ["Le texte argumentatif", "Le résumé de texte"] },
    ],
    "2NDE": [
      { title: "Les objets d'étude", lessons: ["Le roman et la nouvelle", "Le théâtre", "La poésie"] },
      { title: "Techniques d'expression", lessons: ["Le commentaire composé (introduction)", "La dissertation (initiation)"] },
    ],
    "1ERE": [
      { title: "Étude des genres", lessons: ["Le roman", "Le théâtre classique et moderne", "La poésie"] },
      { title: "Méthodologie (épreuves du BAC)", lessons: ["Le commentaire composé", "La dissertation littéraire", "Le résumé / la contraction"] },
    ],
    "TLE": [
      { title: "Littérature et idées", lessons: ["Littérature africaine et ivoirienne", "Les grands courants littéraires"] },
      { title: "Méthodologie (BAC)", lessons: ["La dissertation", "Le commentaire composé", "Le résumé suivi de discussion"] },
    ],
  },

  philosophie: {
    "TLE": [
      { title: "Introduction à la philosophie", lessons: ["Qu'est-ce que la philosophie ?", "Méthodologie : dissertation et explication de texte"] },
      { title: "La connaissance", lessons: ["La vérité", "La science et la technique", "La raison et le réel"] },
      { title: "La morale et la politique", lessons: ["La liberté", "Le devoir", "L'État, la justice et le droit"] },
      { title: "L'existence et la culture", lessons: ["Autrui", "Le travail", "La culture et la société"] },
    ],
  },

  anglais: {
    "6EME": [
      { title: "Greetings and introductions", lessons: ["Saying hello, name, age", "The verb 'to be'"] },
      { title: "My environment", lessons: ["Family and school", "Numbers, colours"] },
    ],
    "5EME": [
      { title: "Daily life", lessons: ["Present simple", "Telling the time"] },
      { title: "Describing", lessons: ["There is / there are", "Adjectives"] },
    ],
    "4EME": [
      { title: "Past events", lessons: ["Past simple", "Irregular verbs"] },
      { title: "Plans and abilities", lessons: ["Be going to", "Can / could"] },
    ],
    "3EME": [
      { title: "Talking about experience", lessons: ["Present perfect", "Comparatives and superlatives"] },
      { title: "BEPC practice", lessons: ["Reading comprehension", "Guided writing"] },
    ],
    "2NDE": [
      { title: "Tenses review", lessons: ["Present, past, future", "Modals"] },
      { title: "Communication", lessons: ["Expressing opinions", "Letter writing"] },
    ],
    "1ERE": [
      { title: "Complex grammar", lessons: ["Conditionals", "Passive voice", "Reported speech"] },
      { title: "Topics", lessons: ["Society and environment", "Reading comprehension"] },
    ],
    "TLE": [
      { title: "BAC preparation", lessons: ["Essay writing", "Reading comprehension", "All conditionals and tenses"] },
    ],
  },
};

const SUBJECT_LABELS: Record<string, string> = {
  mathematiques: "Mathématiques",
  francais: "Français",
  "physique-chimie": "Physique-Chimie",
  svt: "SVT (Sciences de la Vie et de la Terre)",
  "histoire-geographie": "Histoire-Géographie",
  philosophie: "Philosophie",
  anglais: "Anglais",
};

export function getChapters(subject: string, gradeLevel: string): Chapter[] {
  return CURRICULUM[subject]?.[gradeLevel] ?? [];
}

/**
 * Construit le bloc de contexte « programme ivoirien » injecté dans le prompt
 * système, en fonction de la matière et du niveau sélectionnés.
 */
export function buildCurriculumContext(
  gradeLevel?: string | null,
  subject?: string | null,
  serie?: string | null
): string {
  const parts: string[] = [APC_FRAMEWORK, "", IVORIAN_CONTEXT];

  if (gradeLevel) {
    const cycle = getCycle(gradeLevel);
    const exam = IVORIAN_EXAMS[cycle];
    parts.push(
      "",
      `Examen national visé pour ce cycle : ${exam.name} (${exam.full}). ${exam.note}`
    );
    if (cycle === "LYCEE") {
      const serieInfo = serie
        ? LYCEE_SERIES.find((s) => s.value === serie)
        : undefined;
      if (serieInfo) {
        parts.push(
          `L'élève est en ${serieInfo.label}. ${serieInfo.desc} Adapte la profondeur, le choix des exemples et les coefficients implicites à cette série.`
        );
      } else {
        parts.push(
          `Au lycée, tiens compte de la série de l'élève (A : littéraire, C : maths-physique, D : maths-sciences naturelles) et adapte la profondeur en conséquence.`
        );
      }
    }
  }

  if (subject && gradeLevel) {
    const chapters = getChapters(subject, gradeLevel);
    if (chapters.length > 0) {
      const label = SUBJECT_LABELS[subject] ?? subject;
      const list = chapters
        .map((c) => `• ${c.title} : ${c.lessons.join(" ; ")}`)
        .join("\n");
      parts.push(
        "",
        `Programme officiel de ${label} en ${gradeLevel} (MENA/DPFC). Reste STRICTEMENT dans ce périmètre :`,
        list
      );
    }
  }

  return parts.join("\n");
}
