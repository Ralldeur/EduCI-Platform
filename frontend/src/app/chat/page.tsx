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
          <div className="w-16 h-16 rounded-2xl bg-[var(--color-primary)]/10 text-[var(--color-primary)] flex items-center justify-center">
            <GraduationCap size={32} />
          </div>
        </div>
        <h2 className="text-2xl font-bold mb-2">
          Bienvenue sur Ivoir&apos;Académie
        </h2>
        <p className="text-[var(--color-muted)] mb-8">
          Ton assistant éducatif intelligent pour le programme scolaire ivoirien.
          Crée une nouvelle conversation pour commencer.
        </p>

        <div className="grid grid-cols-2 gap-3 text-left">
          {[
            {
              icon: <MessageSquare size={16} />,
              title: "Discussion",
              desc: "Pose tes questions",
            },
            {
              icon: <ClipboardCheck size={16} />,
              title: "Exercices",
              desc: "Entraîne-toi",
            },
            {
              icon: <BookOpen size={16} />,
              title: "Correction",
              desc: "Corrige tes devoirs",
            },
            {
              icon: <Brain size={16} />,
              title: "Quiz",
              desc: "Teste tes connaissances",
            },
            {
              icon: <HelpCircle size={16} />,
              title: "Révision",
              desc: "Prépare tes examens",
            },
          ].map((item, i) => (
            <div
              key={i}
              className="p-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]"
            >
              <div className="flex items-center gap-2 mb-1 text-[var(--color-primary)]">
                {item.icon}
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
