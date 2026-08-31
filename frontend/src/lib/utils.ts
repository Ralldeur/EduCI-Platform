import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const GRADE_LEVELS = {
  PRIMAIRE: [
    { value: "CP1", label: "CP1" },
    { value: "CP2", label: "CP2" },
    { value: "CE1", label: "CE1" },
    { value: "CE2", label: "CE2" },
    { value: "CM1", label: "CM1" },
    { value: "CM2", label: "CM2" },
  ],
  COLLEGE: [
    { value: "6EME", label: "6ème" },
    { value: "5EME", label: "5ème" },
    { value: "4EME", label: "4ème" },
    { value: "3EME", label: "3ème" },
  ],
  LYCEE: [
    { value: "2NDE", label: "2nde" },
    { value: "1ERE", label: "1ère" },
    { value: "TLE", label: "Terminale" },
  ],
} as const;

export const ALL_GRADE_LEVELS = [
  ...GRADE_LEVELS.PRIMAIRE,
  ...GRADE_LEVELS.COLLEGE,
  ...GRADE_LEVELS.LYCEE,
];

export const SUBJECTS = [
  { value: "mathematiques", label: "Mathématiques", icon: "📐", color: "#3B82F6" },
  { value: "francais", label: "Français", icon: "📖", color: "#EF4444" },
  { value: "physique-chimie", label: "Physique-Chimie", icon: "⚗️", color: "#8B5CF6" },
  { value: "svt", label: "SVT", icon: "🌿", color: "#10B981" },
  { value: "histoire-geographie", label: "Histoire-Géographie", icon: "🌍", color: "#F59E0B" },
  { value: "philosophie", label: "Philosophie", icon: "🤔", color: "#EC4899" },
  { value: "anglais", label: "Anglais", icon: "🇬🇧", color: "#06B6D4" },
] as const;

export const CYCLE_LABELS: Record<string, string> = {
  PRIMAIRE: "Primaire",
  COLLEGE: "Collège",
  LYCEE: "Lycée",
};

const KNOWN_GRADE_CODES = [
  "CP1", "CP2", "CE1", "CE2", "CM1", "CM2",
  "6EME", "5EME", "4EME", "3EME", "2NDE", "1ERE", "TLE",
] as const;

/**
 * Normalise un libellé de niveau scolaire vers le code abrégé attendu par
 * GRADE_LEVELS ("TLE", "2NDE", "6EME"...). Réplique fidèlement
 * normalizeGradeLevel() de chat-service/src/curriculum.js — chat-service et
 * frontend sont deux apps Node séparées sans package partagé, donc pas de
 * module commun à importer ici ; si tu modifies ce mapping, répercute le
 * changement des deux côtés.
 *
 * Nécessaire car l'attribut Keycloak "grade_level" est un texte libre défini
 * par l'admin (ex. "Terminale D", avec la série incluse), alors que
 * GRADE_LEVELS est indexé sur des codes abrégés — sans cette normalisation,
 * une conversation fraîchement créée reçoit un gradeLevel qui ne correspond
 * à aucune <option> du sélecteur (ModeSelector), et la détection "élève de
 * lycée" (affichage du sélecteur de série BAC) échoue silencieusement.
 */
export function normalizeGradeLevel(gradeLevel: string | null | undefined): string {
  if (!gradeLevel) return gradeLevel ?? "";

  const upper = gradeLevel.trim().toUpperCase();
  if ((KNOWN_GRADE_CODES as readonly string[]).includes(upper)) return upper;

  // Normalise accents/casse : "Terminale D" -> "terminale d", "Sixième" -> "sixieme"
  const normalized = gradeLevel
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

  // Terminale : la série (A/C/D) est gérée séparément via le champ `serie`,
  // on l'ignore ici même si elle est accolée au niveau ("terminale d").
  if (/^t(erminale)?\b/.test(normalized)) return "TLE";
  if (/^(1ere|premiere)\b/.test(normalized)) return "1ERE";
  if (/^(2nde|seconde)\b/.test(normalized)) return "2NDE";
  if (/^(3eme|troisieme)\b/.test(normalized)) return "3EME";
  if (/^(4eme|quatrieme)\b/.test(normalized)) return "4EME";
  if (/^(5eme|cinquieme)\b/.test(normalized)) return "5EME";
  if (/^(6eme|sixieme)\b/.test(normalized)) return "6EME";
  if (/^cm2\b/.test(normalized)) return "CM2";
  if (/^cm1\b/.test(normalized)) return "CM1";
  if (/^ce2\b/.test(normalized)) return "CE2";
  if (/^ce1\b/.test(normalized)) return "CE1";
  if (/^cp2\b/.test(normalized)) return "CP2";
  if (/^cp1\b/.test(normalized)) return "CP1";

  // Format non reconnu : on retourne tel quel (comme chat-service) plutôt
  // que de forcer une valeur arbitraire.
  return gradeLevel;
}

export function getGradeLevelLabel(value: string): string {
  const level = ALL_GRADE_LEVELS.find((l) => l.value === value);
  return level?.label ?? value;
}

export function getSubjectLabel(value: string): string {
  const subject = SUBJECTS.find((s) => s.value === value);
  return subject?.label ?? value;
}

export function getSubjectIcon(value: string): string {
  const subject = SUBJECTS.find((s) => s.value === value);
  return subject?.icon ?? "📚";
}
