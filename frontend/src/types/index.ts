export type Role = "STUDENT" | "TEACHER" | "ADMIN";

export type GradeLevel =
  | "CP1" | "CP2" | "CE1" | "CE2" | "CM1" | "CM2"
  | "6EME" | "5EME" | "4EME" | "3EME"
  | "2NDE" | "1ERE" | "TLE";

export type Difficulty = "EASY" | "MEDIUM" | "HARD";
export type ExerciseType = "QCM" | "OPEN" | "TRUE_FALSE" | "FILL_BLANK";
export type MessageRole = "user" | "assistant" | "system";
export type ConversationMode = "CHAT" | "EXERCISE" | "CORRECTION" | "QUIZ" | "REVISION";

export interface ChatMessage {
  id: string;
  content: string;
  role: MessageRole;
  createdAt: string;
}

export interface Conversation {
  id: string;
  title: string | null;
  subject: string | null;
  gradeLevel: string | null;
  serie: string | null;
  mode: ConversationMode;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface ConversationSummary {
  id: string;
  title: string | null;
  subject: string | null;
  gradeLevel: string | null;
  mode: ConversationMode;
  createdAt: string;
  updatedAt: string;
  _count: { messages: number };
}

export interface Exercise {
  id: string;
  question: string;
  answer: string;
  explanation: string | null;
  difficulty: Difficulty;
  type: ExerciseType;
  options: string | null;
  subject: string | null;
  gradeLevel: string;
}

export interface Subject {
  value: string;
  label: string;
  icon: string;
  color: string;
}

export interface LessonData {
  id: string;
  title: string;
  content: string;
  summary: string | null;
  gradeLevel: string;
  subject: { name: string };
  chapter: { title: string };
}
