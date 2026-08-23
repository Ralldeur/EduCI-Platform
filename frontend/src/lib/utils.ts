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
