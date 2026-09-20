"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  MessageSquare,
  ClipboardCheck,
  BookOpen,
  Brain,
  HelpCircle,
} from "lucide-react";
import toast from "react-hot-toast";
import EduCILogo from "@/components/icons/EduCILogo";
import { normalizeGradeLevel } from "@/lib/utils";
import type { ConversationMode } from "@/types";

const QUICK_START_ITEMS: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  mode: ConversationMode;
}[] = [
  {
    icon: <MessageSquare size={15} />,
    title: "Discussion",
    desc: "Pose tes questions",
    mode: "CHAT",
  },
  {
    icon: <ClipboardCheck size={15} />,
    title: "Exercices",
    desc: "Entraîne-toi",
    mode: "EXERCISE",
  },
  {
    icon: <BookOpen size={15} />,
    title: "Correction",
    desc: "Corrige tes devoirs",
    mode: "CORRECTION",
  },
  {
    icon: <Brain size={15} />,
    title: "Quiz",
    desc: "Teste tes connaissances",
    mode: "QUIZ",
  },
  {
    icon: <HelpCircle size={15} />,
    title: "Révision",
    desc: "Prépare tes examens",
    mode: "REVISION",
  },
];

export default function ChatHome() {
  const router = useRouter();
  const { data: session } = useSession();
  const [loadingMode, setLoadingMode] = useState<ConversationMode | null>(null);

  const handleQuickStart = async (mode: ConversationMode) => {
    if (loadingMode) return;
    setLoadingMode(mode);
    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          gradeLevel: normalizeGradeLevel(session?.user?.gradeLevel),
        }),
      });

      if (res.ok) {
        const conv = await res.json();
        router.push(`/chat/${conv.id}`);
      } else {
        toast.error("Erreur lors de la création");
      }
    } catch {
      toast.error("Erreur lors de la création");
    } finally {
      setLoadingMode(null);
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="text-center max-w-md">
        <div className="flex justify-center mb-6">
          <div className="w-14 h-14 rounded-[var(--radius-lg)] bg-[var(--color-primary-subtle)] text-[var(--color-primary)] flex items-center justify-center">
            <EduCILogo width={26} height={26} />
          </div>
        </div>
        <h2 className="text-xl font-semibold tracking-tight mb-2">
          Bienvenue sur EduCI
        </h2>
        <p className="text-sm text-[var(--color-muted)] leading-relaxed mb-8">
          Ton assistant éducatif intelligent pour le programme scolaire ivoirien.
          Crée une nouvelle conversation pour commencer.
        </p>

        <div className="grid grid-cols-2 gap-2.5 text-left">
          {QUICK_START_ITEMS.map((item) => (
            <button
              key={item.title}
              type="button"
              onClick={() => handleQuickStart(item.mode)}
              disabled={loadingMode !== null}
              className="p-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-raised)] hover:border-[var(--color-border-strong)] transition-colors text-left cursor-pointer disabled:opacity-60 disabled:cursor-wait"
            >
              <div className="flex items-center gap-2 mb-1 text-[var(--color-foreground)]">
                <span className="text-[var(--color-primary)]">{item.icon}</span>
                <span className="text-sm font-medium">{item.title}</span>
              </div>
              <p className="text-xs text-[var(--color-muted)]">
                {loadingMode === item.mode ? "Création..." : item.desc}
              </p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
