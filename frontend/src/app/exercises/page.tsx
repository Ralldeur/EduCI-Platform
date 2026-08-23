"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  GraduationCap,
  Loader2,
  CheckCircle,
  XCircle,
  ArrowLeft,
} from "lucide-react";
import Button from "@/components/ui/Button";
import Select from "@/components/ui/Select";
import { SUBJECTS, ALL_GRADE_LEVELS } from "@/lib/utils";
import { LYCEE_SERIES } from "@/lib/curriculum";
import ReactMarkdown from "react-markdown";
import toast from "react-hot-toast";
import Link from "next/link";

interface GeneratedExercise {
  question: string;
  answer: string;
  explanation: string;
  options?: string[];
}

interface CorrectionResult {
  score: number;
  feedback: string;
  positives: string[];
  errors: string[];
  correction: string;
  tips: string[];
}

export default function ExercisesPage() {
  const { status } = useSession();
  const router = useRouter();
  const [subject, setSubject] = useState("");
  const [gradeLevel, setGradeLevel] = useState("");
  const [serie, setSerie] = useState("");
  const [difficulty, setDifficulty] = useState("MEDIUM");
  const [exerciseType, setExerciseType] = useState("OPEN");
  const [topic, setTopic] = useState("");
  const [exercises, setExercises] = useState<GeneratedExercise[]>([]);
  const [generating, setGenerating] = useState(false);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [corrections, setCorrections] = useState<
    Record<number, CorrectionResult>
  >({});
  const [correcting, setCorrecting] = useState<number | null>(null);
  const [showAnswers, setShowAnswers] = useState<Record<number, boolean>>({});

  if (status === "unauthenticated") {
    router.push("/login");
    return null;
  }

  const handleGenerate = async () => {
    if (!subject || !gradeLevel) {
      toast.error("Sélectionne une matière et un niveau");
      return;
    }

    setGenerating(true);
    setExercises([]);
    setAnswers({});
    setCorrections({});
    setShowAnswers({});

    try {
      const res = await fetch("/api/exercises/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject,
          gradeLevel,
          serie,
          difficulty,
          type: exerciseType,
          topic,
          count: 3,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setExercises(data.exercises ?? []);
      } else {
        toast.error("Erreur de génération");
      }
    } catch {
      toast.error("Erreur de communication");
    } finally {
      setGenerating(false);
    }
  };

  const handleCorrect = async (index: number) => {
    const exercise = exercises[index];
    const answer = answers[index];
    if (!answer?.trim()) {
      toast.error("Écris ta réponse avant de corriger");
      return;
    }

    setCorrecting(index);

    try {
      const res = await fetch("/api/exercises/correct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: exercise.question,
          studentAnswer: answer,
          correctAnswer: exercise.answer,
          subject,
          gradeLevel,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setCorrections((prev) => ({ ...prev, [index]: data }));
      }
    } catch {
      toast.error("Erreur de correction");
    } finally {
      setCorrecting(null);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--color-background)]">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-8">
          <Link href="/chat">
            <Button variant="ghost" size="icon">
              <ArrowLeft size={18} />
            </Button>
          </Link>
          <GraduationCap size={28} className="text-[var(--color-primary)]" />
          <h1 className="text-2xl font-bold">Exercices</h1>
        </div>

        {/* Generation form */}
        <div className="p-6 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] mb-8">
          <h2 className="font-semibold mb-4">Générer des exercices</h2>
          <div className="grid sm:grid-cols-2 gap-4 mb-4">
            <Select
              label="Matière"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              options={SUBJECTS.map((s) => ({
                value: s.value,
                label: `${s.icon} ${s.label}`,
              }))}
              placeholder="Choisis une matière"
            />
            <Select
              label="Niveau"
              value={gradeLevel}
              onChange={(e) => setGradeLevel(e.target.value)}
              options={ALL_GRADE_LEVELS.map((l) => ({
                value: l.value,
                label: l.label,
              }))}
              placeholder="Choisis un niveau"
            />
            {["2NDE", "1ERE", "TLE"].includes(gradeLevel) && (
              <Select
                label="Série (BAC)"
                value={serie}
                onChange={(e) => setSerie(e.target.value)}
                options={LYCEE_SERIES.map((s) => ({
                  value: s.value,
                  label: s.label,
                }))}
                placeholder="Choisis une série"
              />
            )}
            <Select
              label="Difficulté"
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
              options={[
                { value: "EASY", label: "Facile" },
                { value: "MEDIUM", label: "Moyen" },
                { value: "HARD", label: "Difficile" },
              ]}
            />
            <Select
              label="Type"
              value={exerciseType}
              onChange={(e) => setExerciseType(e.target.value)}
              options={[
                { value: "OPEN", label: "Question ouverte" },
                { value: "QCM", label: "QCM" },
                { value: "TRUE_FALSE", label: "Vrai/Faux" },
                { value: "FILL_BLANK", label: "Texte à trou" },
              ]}
            />
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1.5">
              Sujet spécifique (optionnel)
            </label>
            <input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Ex: Les fractions, Le théorème de Pythagore..."
              className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] text-[var(--color-foreground)] placeholder:text-[var(--color-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] text-sm"
            />
          </div>
          <Button
            onClick={handleGenerate}
            disabled={generating}
            className="gap-2"
          >
            {generating ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Génération...
              </>
            ) : (
              "Générer les exercices"
            )}
          </Button>
        </div>

        {/* Exercises */}
        {exercises.map((exercise, i) => (
          <div
            key={i}
            className="p-6 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] mb-4"
          >
            <div className="flex items-center gap-2 mb-3">
              <span className="w-7 h-7 rounded-full bg-[var(--color-primary)] text-white flex items-center justify-center text-sm font-bold">
                {i + 1}
              </span>
              <h3 className="font-semibold">Exercice {i + 1}</h3>
            </div>

            <div className="prose-chat text-sm mb-4">
              <ReactMarkdown>{exercise.question}</ReactMarkdown>
            </div>

            {exercise.options && (
              <div className="space-y-2 mb-4">
                {exercise.options.map((opt, j) => (
                  <label
                    key={j}
                    className="flex items-center gap-2 p-2 rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-surface-hover)] cursor-pointer text-sm"
                  >
                    <input
                      type="radio"
                      name={`exercise-${i}`}
                      value={opt}
                      onChange={(e) =>
                        setAnswers((prev) => ({
                          ...prev,
                          [i]: e.target.value,
                        }))
                      }
                    />
                    {opt}
                  </label>
                ))}
              </div>
            )}

            {!exercise.options && (
              <textarea
                value={answers[i] ?? ""}
                onChange={(e) =>
                  setAnswers((prev) => ({ ...prev, [i]: e.target.value }))
                }
                placeholder="Écris ta réponse ici..."
                rows={3}
                className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] text-[var(--color-foreground)] placeholder:text-[var(--color-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] text-sm resize-none mb-4"
              />
            )}

            <div className="flex gap-2">
              <Button
                onClick={() => handleCorrect(i)}
                disabled={correcting === i}
                size="sm"
                className="gap-1"
              >
                {correcting === i ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Correction...
                  </>
                ) : (
                  "Corriger"
                )}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  setShowAnswers((prev) => ({ ...prev, [i]: !prev[i] }))
                }
              >
                {showAnswers[i] ? "Masquer la réponse" : "Voir la réponse"}
              </Button>
            </div>

            {showAnswers[i] && (
              <div className="mt-3 p-3 rounded-lg bg-[var(--color-secondary)]/10 border border-[var(--color-secondary)]/20 text-sm">
                <p className="font-medium text-[var(--color-secondary)] mb-1">
                  Réponse :
                </p>
                <ReactMarkdown>{exercise.answer}</ReactMarkdown>
                {exercise.explanation && (
                  <>
                    <p className="font-medium text-[var(--color-secondary)] mt-2 mb-1">
                      Explication :
                    </p>
                    <ReactMarkdown>{exercise.explanation}</ReactMarkdown>
                  </>
                )}
              </div>
            )}

            {corrections[i] && (
              <div className="mt-3 p-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)]">
                <div className="flex items-center gap-2 mb-3">
                  {corrections[i].score >= 10 ? (
                    <CheckCircle
                      size={20}
                      className="text-[var(--color-secondary)]"
                    />
                  ) : (
                    <XCircle size={20} className="text-red-500" />
                  )}
                  <span className="font-bold text-lg">
                    {corrections[i].score}/20
                  </span>
                </div>
                <p className="text-sm mb-2">{corrections[i].feedback}</p>
                {corrections[i].positives?.length > 0 && (
                  <div className="mb-2">
                    <p className="text-xs font-medium text-[var(--color-secondary)] mb-1">
                      Points positifs :
                    </p>
                    <ul className="text-xs space-y-0.5">
                      {corrections[i].positives.map((p, j) => (
                        <li key={j}>+ {p}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {corrections[i].errors?.length > 0 && (
                  <div className="mb-2">
                    <p className="text-xs font-medium text-red-500 mb-1">
                      Erreurs :
                    </p>
                    <ul className="text-xs space-y-0.5">
                      {corrections[i].errors.map((e, j) => (
                        <li key={j}>- {e}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {corrections[i].tips?.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-[var(--color-accent)] mb-1">
                      Conseils :
                    </p>
                    <ul className="text-xs space-y-0.5">
                      {corrections[i].tips.map((t, j) => (
                        <li key={j}>💡 {t}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
