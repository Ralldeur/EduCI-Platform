"use client";

import {
  GraduationCap,
  MessageSquare,
  ClipboardCheck,
  BookOpen,
  Brain,
  HelpCircle,
} from "lucide-react";

export default function ChatHome() {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="text-center max-w-md">
        <div className="flex justify-center mb-6">
          <div className="w-14 h-14 rounded-[var(--radius-lg)] bg-[var(--color-primary-subtle)] text-[var(--color-primary)] flex items-center justify-center">
            <GraduationCap size={26} />
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
          {[
            {
              icon: <MessageSquare size={15} />,
              title: "Discussion",
              desc: "Pose tes questions",
            },
            {
              icon: <ClipboardCheck size={15} />,
              title: "Exercices",
              desc: "Entraîne-toi",
            },
            {
              icon: <BookOpen size={15} />,
              title: "Correction",
              desc: "Corrige tes devoirs",
            },
            {
              icon: <Brain size={15} />,
              title: "Quiz",
              desc: "Teste tes connaissances",
            },
            {
              icon: <HelpCircle size={15} />,
              title: "Révision",
              desc: "Prépare tes examens",
            },
          ].map((item, i) => (
            <div
              key={i}
              className="p-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-raised)] hover:border-[var(--color-border-strong)] transition-colors"
            >
              <div className="flex items-center gap-2 mb-1 text-[var(--color-foreground)]">
                <span className="text-[var(--color-primary)]">{item.icon}</span>
                <span className="text-sm font-medium">{item.title}</span>
              </div>
              <p className="text-xs text-[var(--color-muted)]">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
