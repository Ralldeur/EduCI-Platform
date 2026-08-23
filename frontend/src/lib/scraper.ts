import axios from "axios";
import * as cheerio from "cheerio";
import { prisma } from "@/lib/prisma";

export interface ScrapedItem {
  title: string;
  content: string;
  url: string;
  source: string;
  subject?: string;
  gradeLevel?: string;
}

const HTTP_HEADERS = {
  "User-Agent":
    "IvoirAcademie/1.0 (https://github.com/Ralldeur/ivoir-academie; contact@ivoir-academie.ci) educational-platform",
  "Accept": "text/html,application/xhtml+xml,application/json",
  "Accept-Language": "fr-FR,fr;q=0.9",
};

const SUBJECT_KEYWORDS: Record<string, string[]> = {
  mathematiques: ["mathématiques", "maths", "algèbre", "géométrie", "arithmétique", "calcul", "équation", "fonction", "probabilité", "statistique", "pythagore", "thalès"],
  francais: ["français", "grammaire", "conjugaison", "orthographe", "littérature", "rédaction", "vocabulaire", "syntaxe", "lecture"],
  "physique-chimie": ["physique", "chimie", "atome", "molécule", "énergie", "force", "électricité", "optique", "réaction chimique", "thermodynamique"],
  svt: ["svt", "biologie", "géologie", "cellule", "organisme", "écosystème", "reproduction", "génétique", "environnement"],
  "histoire-geographie": ["histoire", "géographie", "colonisation", "indépendance", "afrique", "côte d'ivoire", "civilisation", "continent", "climat", "population"],
  philosophie: ["philosophie", "conscience", "liberté", "morale", "éthique", "pensée", "raison", "justice", "vérité"],
  anglais: ["anglais", "english", "grammar", "vocabulary", "reading", "writing", "comprehension"],
};

function detectSubject(text: string): string | undefined {
  const lower = text.toLowerCase();
  let bestMatch: string | undefined;
  let bestScore = 0;

  for (const [subject, keywords] of Object.entries(SUBJECT_KEYWORDS)) {
    const score = keywords.filter((kw) => lower.includes(kw)).length;
    if (score > bestScore) {
      bestScore = score;
      bestMatch = subject;
    }
  }

  return bestScore > 0 ? bestMatch : undefined;
}

function detectGradeLevel(text: string): string | undefined {
  const lower = text.toLowerCase();
  const patterns: [RegExp, string][] = [
    [/\bcp1\b/, "CP1"], [/\bcp2\b/, "CP2"],
    [/\bce1\b/, "CE1"], [/\bce2\b/, "CE2"],
    [/\bcm1\b/, "CM1"], [/\bcm2\b/, "CM2"],
    [/\b6[eè]me\b/, "6EME"], [/\b5[eè]me\b/, "5EME"],
    [/\b4[eè]me\b/, "4EME"], [/\b3[eè]me\b/, "3EME"],
    [/\b2nde\b|\bseconde\b/, "2NDE"], [/\b1[eè]re\b|\bpremi[eè]re\b/, "1ERE"],
    [/\bterminale\b|\btle\b/, "TLE"],
    [/\bprimaire\b/, "CM2"], [/\bcollège\b|\bcollege\b/, "3EME"], [/\blycée\b|\blycee\b/, "TLE"],
  ];

  for (const [pattern, level] of patterns) {
    if (pattern.test(lower)) return level;
  }
  return undefined;
}

async function fetchPage(url: string): Promise<string | null> {
  try {
    const response = await axios.get(url, {
      timeout: 15000,
      headers: HTTP_HEADERS,
    });
    return response.data;
  } catch (error) {
    console.error(`Failed to fetch ${url}:`, error instanceof Error ? error.message : error);
    return null;
  }
}

export async function scrapeEducationGouv(): Promise<ScrapedItem[]> {
  const items: ScrapedItem[] = [];
  // The root domain is a splash page; the real portal lives under /index.php/Welcome
  const urls = [
    "https://www.education.gouv.ci/index.php/Welcome",
  ];

  for (const url of urls) {
    const html = await fetchPage(url);
    if (!html) continue;

    const $ = cheerio.load(html);

    // News carousel captions and media items (official MENA announcements)
    $(".carousel-caption, .media-body, article, .news-item, .post").each((_, el) => {
      const raw = $(el).text().replace(/\s+/g, " ").replace(/Lire plus/gi, "").trim();
      if (raw.length > 40) {
        const heading = $(el).find("h1, h2, h3, h4, .title").first().text().trim();
        const title = heading && heading.length > 5 ? heading : raw;
        items.push({
          title: title.substring(0, 200),
          content: raw.substring(0, 2000),
          url,
          source: "education.gouv.ci",
          subject: detectSubject(raw),
          gradeLevel: detectGradeLevel(raw),
        });
      }
    });

    // Fallback: substantial paragraphs and headings
    $("p, h2, h3").each((_, el) => {
      const text = $(el).text().replace(/\s+/g, " ").trim();
      if (text.length > 60) {
        items.push({
          title: text.substring(0, 120),
          content: text.substring(0, 2000),
          url,
          source: "education.gouv.ci",
          subject: detectSubject(text),
          gradeLevel: detectGradeLevel(text),
        });
      }
    });
  }

  // Deduplicate by title
  const seen = new Set<string>();
  return items.filter((it) => {
    if (seen.has(it.title)) return false;
    seen.add(it.title);
    return true;
  });
}

export async function scrapeAbidjanNet(): Promise<ScrapedItem[]> {
  const items: ScrapedItem[] = [];
  const urls = [
    "https://www.abidjan.net/education/",
    "https://news.abidjan.net/articles/education",
  ];

  for (const url of urls) {
    const html = await fetchPage(url);
    if (!html) continue;

    const $ = cheerio.load(html);

    $("article, .article, .item, .list-item, .card, .news-item").each((_, el) => {
      const title = $(el).find("h1, h2, h3, h4, a").first().text().trim();
      const content = $(el).find("p, .text, .desc, .summary").text().trim();

      if (title && content && content.length > 30) {
        items.push({
          title: title.substring(0, 200),
          content: content.substring(0, 2000),
          url,
          source: "abidjan.net",
          subject: detectSubject(`${title} ${content}`),
          gradeLevel: detectGradeLevel(`${title} ${content}`),
        });
      }
    });
  }

  return items;
}

export async function scrapeWikipedia(topics: string[]): Promise<ScrapedItem[]> {
  const items: ScrapedItem[] = [];

  for (const topic of topics) {
    try {
      const searchUrl = `https://fr.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(topic)}&srlimit=3&format=json&utf8=1`;
      const searchRes = await axios.get(searchUrl, { timeout: 10000, headers: HTTP_HEADERS });
      const searchResults = searchRes.data?.query?.search ?? [];

      for (const result of searchResults) {
        const pageTitle = result.title;
        const extractUrl = `https://fr.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(pageTitle)}&prop=extracts&exintro=false&exsectionformat=plain&explaintext=true&exlimit=1&format=json&utf8=1`;
        const extractRes = await axios.get(extractUrl, { timeout: 10000, headers: HTTP_HEADERS });
        const pages = extractRes.data?.query?.pages ?? {};
        const page = Object.values(pages)[0] as { extract?: string; title?: string };

        if (page?.extract && page.extract.length > 100) {
          items.push({
            title: (page.title ?? pageTitle).substring(0, 200),
            content: page.extract.substring(0, 3000),
            url: `https://fr.wikipedia.org/wiki/${encodeURIComponent(pageTitle.replace(/ /g, "_"))}`,
            source: "wikipedia",
            subject: detectSubject(`${pageTitle} ${page.extract}`),
            gradeLevel: detectGradeLevel(`${pageTitle} ${page.extract}`),
          });
        }
      }
    } catch (error) {
      console.error(`Wikipedia scrape error for "${topic}":`, error instanceof Error ? error.message : error);
    }
  }

  return items;
}

const EDUCATIONAL_TOPICS = [
  // Mathématiques
  "théorème de Pythagore", "théorème de Thalès", "équations du second degré",
  "fonctions affines", "trigonométrie", "probabilités", "statistiques",
  "fractions", "géométrie dans l'espace", "vecteurs",
  // Français
  "conjugaison française", "grammaire française", "littérature africaine",
  "dissertation", "commentaire composé", "figures de style",
  // Physique-Chimie
  "lois de Newton", "énergie cinétique", "réactions chimiques",
  "atome et molécule", "électricité circuit", "optique géométrique",
  // SVT
  "cellule biologie", "génétique mendélienne", "écosystème",
  "reproduction humaine", "photosynthèse", "système immunitaire",
  // Histoire-Géo
  "histoire Côte d'Ivoire", "colonisation Afrique", "décolonisation Afrique",
  "Félix Houphouët-Boigny", "géographie Afrique de l'Ouest",
  // Philosophie
  "conscience philosophie", "liberté philosophie", "justice sociale",
  // Anglais
  "English grammar tenses", "English vocabulary education",
];

export async function runFullScrape(): Promise<{ totalItems: number; sources: Record<string, number> }> {
  console.log("Starting full scrape...");
  const allItems: ScrapedItem[] = [];
  const sources: Record<string, number> = {};

  // Scrape all sources in parallel
  const [educGouv, abidjan, wikipedia] = await Promise.allSettled([
    scrapeEducationGouv(),
    scrapeAbidjanNet(),
    scrapeWikipedia(EDUCATIONAL_TOPICS),
  ]);

  if (educGouv.status === "fulfilled") {
    allItems.push(...educGouv.value);
    sources["education.gouv.ci"] = educGouv.value.length;
  }
  if (abidjan.status === "fulfilled") {
    allItems.push(...abidjan.value);
    sources["abidjan.net"] = abidjan.value.length;
  }
  if (wikipedia.status === "fulfilled") {
    allItems.push(...wikipedia.value);
    sources["wikipedia"] = wikipedia.value.length;
  }

  // Save to database
  let savedCount = 0;
  for (const item of allItems) {
    try {
      await prisma.scrapedContent.upsert({
        where: {
          url_title: { url: item.url, title: item.title },
        },
        update: {
          content: item.content,
          subject: item.subject,
          gradeLevel: item.gradeLevel,
          updatedAt: new Date(),
        },
        create: {
          title: item.title,
          content: item.content,
          url: item.url,
          source: item.source,
          subject: item.subject,
          gradeLevel: item.gradeLevel,
        },
      });
      savedCount++;
    } catch (error) {
      console.error(`Failed to save "${item.title}":`, error instanceof Error ? error.message : error);
    }
  }

  console.log(`Scrape complete: ${savedCount}/${allItems.length} items saved`);
  return { totalItems: savedCount, sources };
}

export async function searchScrapedContent(
  query: string,
  subject?: string | null,
  gradeLevel?: string | null,
  limit: number = 5
): Promise<Array<{ title: string; content: string; source: string; url: string }>> {
  const keywords = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2);

  if (keywords.length === 0) return [];

  // SQLite `contains` is case-sensitive and does not handle accents, so we
  // fetch candidates (optionally narrowed by subject/grade) and rank them in
  // JavaScript with case-insensitive matching for reliable RAG retrieval.
  const candidates = await prisma.scrapedContent.findMany({
    where: {
      AND: [
        ...(subject ? [{ subject }] : []),
        ...(gradeLevel ? [{ OR: [{ gradeLevel }, { gradeLevel: null }] }] : []),
      ],
    },
    orderBy: { updatedAt: "desc" },
    take: 1000,
    select: { title: true, content: true, source: true, url: true },
  });

  // Rank by keyword match count (title matches weighted higher)
  const scored = candidates
    .map((r) => {
      const title = r.title.toLowerCase();
      const text = `${title} ${r.content.toLowerCase()}`;
      const score = keywords.reduce((acc, kw) => {
        if (title.includes(kw)) return acc + 2;
        if (text.includes(kw)) return acc + 1;
        return acc;
      }, 0);
      return { ...r, score };
    })
    .filter((r) => r.score > 0);

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map(({ title, content, source, url }) => ({
    title,
    content: content.substring(0, 800),
    source,
    url,
  }));
}
