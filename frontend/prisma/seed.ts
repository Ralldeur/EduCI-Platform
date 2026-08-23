import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { CURRICULUM, IVORIAN_EXAMS, getCycle } from "../src/lib/curriculum";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // Create admin user
  const adminPassword = await bcrypt.hash("admin123", 12);
  const admin = await prisma.user.upsert({
    where: { email: "admin@ivoir-academie.ci" },
    update: {},
    create: {
      name: "Administrateur",
      email: "admin@ivoir-academie.ci",
      password: adminPassword,
      role: "ADMIN",
    },
  });
  console.log("Admin created:", admin.email);

  // Create demo student
  const studentPassword = await bcrypt.hash("eleve123", 12);
  const student = await prisma.user.upsert({
    where: { email: "eleve@ivoir-academie.ci" },
    update: {},
    create: {
      name: "Aya Kouassi",
      email: "eleve@ivoir-academie.ci",
      password: studentPassword,
      role: "STUDENT",
      gradeLevel: "3EME",
    },
  });
  console.log("Student created:", student.email);

  // Create subjects
  const subjects = [
    { name: "mathematiques", icon: "📐", color: "#3B82F6" },
    { name: "francais", icon: "📖", color: "#EF4444" },
    { name: "physique-chimie", icon: "⚗️", color: "#8B5CF6" },
    { name: "svt", icon: "🌿", color: "#10B981" },
    { name: "histoire-geographie", icon: "🌍", color: "#F59E0B" },
    { name: "philosophie", icon: "🤔", color: "#EC4899" },
    { name: "anglais", icon: "🇬🇧", color: "#06B6D4" },
  ];

  for (const s of subjects) {
    await prisma.subject.upsert({
      where: { name: s.name },
      update: {},
      create: s,
    });
  }
  console.log("Subjects created");

  // Create sample chapters and lessons
  const mathSubject = await prisma.subject.findUnique({
    where: { name: "mathematiques" },
  });

  if (mathSubject) {
    const chapter = await prisma.chapter.create({
      data: {
        title: "Les nombres et calculs",
        orderNum: 1,
        subjectId: mathSubject.id,
        gradeLevel: "3EME",
      },
    });

    await prisma.lesson.create({
      data: {
        title: "Les fractions : addition et soustraction",
        content: `# Les fractions : addition et soustraction

## Rappel
Une fraction est un nombre qui s'écrit sous la forme a/b où :
- a est le numérateur
- b est le dénominateur (b ≠ 0)

## Addition de fractions de même dénominateur
Pour additionner deux fractions qui ont le même dénominateur, on additionne les numérateurs et on garde le même dénominateur.

**Exemple :** 2/5 + 1/5 = (2+1)/5 = 3/5

## Addition de fractions de dénominateurs différents
Pour additionner deux fractions de dénominateurs différents :
1. Trouver le PPCM des dénominateurs
2. Réduire les fractions au même dénominateur
3. Additionner les numérateurs

**Exemple :** 1/3 + 1/4
- PPCM(3, 4) = 12
- 1/3 = 4/12
- 1/4 = 3/12
- 4/12 + 3/12 = 7/12

## Soustraction de fractions
La soustraction suit les mêmes règles que l'addition.

**Exemple :** 3/4 - 1/6
- PPCM(4, 6) = 12
- 3/4 = 9/12
- 1/6 = 2/12
- 9/12 - 2/12 = 7/12`,
        summary:
          "Les fractions s'additionnent et se soustraient en les mettant au même dénominateur. On utilise le PPCM pour trouver le dénominateur commun.",
        subjectId: mathSubject.id,
        chapterId: chapter.id,
        gradeLevel: "3EME",
      },
    });

    await prisma.lesson.create({
      data: {
        title: "Le théorème de Pythagore",
        content: `# Le théorème de Pythagore

## Énoncé
Dans un triangle rectangle, le carré de l'hypoténuse est égal à la somme des carrés des deux autres côtés.

Si ABC est un triangle rectangle en A, alors :
**BC² = AB² + AC²**

## Application : Calculer l'hypoténuse
**Exemple :** Dans un triangle rectangle ABC, rectangle en A :
- AB = 3 cm
- AC = 4 cm
- BC² = 3² + 4² = 9 + 16 = 25
- BC = √25 = **5 cm**

## Application : Calculer un côté de l'angle droit
**Exemple :** BC = 13 cm, AB = 5 cm
- AC² = BC² - AB² = 169 - 25 = 144
- AC = √144 = **12 cm**

## Réciproque du théorème de Pythagore
Si dans un triangle, le carré du plus grand côté est égal à la somme des carrés des deux autres côtés, alors ce triangle est rectangle.

## Exemples de la vie quotidienne en Côte d'Ivoire
- Un maçon vérifie l'angle droit d'un mur en utilisant le triangle 3-4-5
- Un électricien calcule la longueur de câble nécessaire entre deux points`,
        summary:
          "Dans un triangle rectangle, BC² = AB² + AC². Ce théorème permet de calculer la longueur d'un côté d'un triangle rectangle.",
        subjectId: mathSubject.id,
        chapterId: chapter.id,
        gradeLevel: "3EME",
      },
    });

    console.log("Math lessons created");
  }

  // Create French lessons
  const frSubject = await prisma.subject.findUnique({
    where: { name: "francais" },
  });

  if (frSubject) {
    const chapter = await prisma.chapter.create({
      data: {
        title: "Grammaire",
        orderNum: 1,
        subjectId: frSubject.id,
        gradeLevel: "3EME",
      },
    });

    await prisma.lesson.create({
      data: {
        title: "Les types et formes de phrases",
        content: `# Les types et formes de phrases

## Les 4 types de phrases

### 1. La phrase déclarative
Elle donne une information, exprime un fait. Elle se termine par un point.
**Exemple :** Abidjan est la capitale économique de la Côte d'Ivoire.

### 2. La phrase interrogative
Elle pose une question. Elle se termine par un point d'interrogation.
**Exemple :** As-tu fait tes devoirs ?

### 3. La phrase exclamative
Elle exprime un sentiment fort. Elle se termine par un point d'exclamation.
**Exemple :** Quelle belle journée !

### 4. La phrase impérative (injonctive)
Elle donne un ordre, un conseil ou une interdiction.
**Exemple :** Ouvre ton cahier à la page 25.

## Les formes de phrases

### Forme affirmative / négative
- Affirmative : Je comprends la leçon.
- Négative : Je ne comprends pas la leçon.

### Forme active / passive
- Active : L'élève lit le livre.
- Passive : Le livre est lu par l'élève.`,
        summary:
          "Il existe 4 types de phrases (déclarative, interrogative, exclamative, impérative) et plusieurs formes (affirmative/négative, active/passive).",
        subjectId: frSubject.id,
        chapterId: chapter.id,
        gradeLevel: "3EME",
      },
    });

    console.log("French lessons created");
  }

  // Seed the full official Ivorian programme (APC) from the curriculum module.
  // Creates a Chapter per programme chapter and a Lesson per programme lesson,
  // skipping any that already exist so the rich flagship lessons above are kept.
  let curriculumChapters = 0;
  let curriculumLessons = 0;
  for (const [subjectName, levels] of Object.entries(CURRICULUM)) {
    const subjectRow = await prisma.subject.findUnique({
      where: { name: subjectName },
    });
    if (!subjectRow) continue;

    for (const [gradeLevel, chapters] of Object.entries(levels)) {
      if (!chapters) continue;
      const exam = IVORIAN_EXAMS[getCycle(gradeLevel)];

      for (let i = 0; i < chapters.length; i++) {
        const ch = chapters[i];
        const existingChapter = await prisma.chapter.findFirst({
          where: { title: ch.title, gradeLevel, subjectId: subjectRow.id },
        });
        const chapterRow =
          existingChapter ??
          (await prisma.chapter.create({
            data: {
              title: ch.title,
              orderNum: i + 1,
              subjectId: subjectRow.id,
              gradeLevel,
            },
          }));
        if (!existingChapter) curriculumChapters++;

        for (const lessonTitle of ch.lessons) {
          const existingLesson = await prisma.lesson.findFirst({
            where: { title: lessonTitle, gradeLevel, subjectId: subjectRow.id },
          });
          if (existingLesson) continue;

          const content = `# ${lessonTitle}

**Matière :** ${subjectName} · **Niveau :** ${gradeLevel} · **Chapitre :** ${ch.title}
**Cadre :** Programme officiel ivoirien (MENA/DPFC) — Approche Par les Compétences (APC)

## Compétence visée
À la fin de cette leçon, l'élève doit être capable de traiter une situation relative à « ${ch.title} » en mobilisant la notion : ${lessonTitle}.

## Contenu de la leçon
${lessonTitle} fait partie du programme de ${subjectName} de la classe de ${gradeLevel} en Côte d'Ivoire. La leçon est abordée selon l'APC : on part d'une situation d'apprentissage tirée du quotidien ivoirien, on installe les habiletés, puis on évalue par une situation.

## Exemple ancré en Côte d'Ivoire
Les exemples et exercices s'appuient sur le contexte ivoirien (FCFA, villes comme Abidjan, Bouaké ou Korhogo, économie du cacao et du café, prénoms ivoiriens).

## Vers l'examen
Cette notion peut être évaluée à l'examen national : ${exam.name} (${exam.full}).`;

          await prisma.lesson.create({
            data: {
              title: lessonTitle,
              content,
              summary: `${lessonTitle} — ${ch.title} (${subjectName}, ${gradeLevel}). Programme ivoirien APC, préparation au ${exam.name}.`,
              subjectId: subjectRow.id,
              chapterId: chapterRow.id,
              gradeLevel,
            },
          });
          curriculumLessons++;
        }
      }
    }
  }
  console.log(
    `Curriculum ivoirien seedé : ${curriculumChapters} chapitres, ${curriculumLessons} leçons`
  );

  console.log("Seeding completed!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
