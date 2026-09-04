"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import {
  GraduationCap,
  MessageSquare,
  ClipboardCheck,
  BookOpen,
  Brain,
  ArrowRight,
} from "lucide-react";
import Button from "@/components/ui/Button";
import Link from "next/link";

export default function HomePage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "authenticated") {
      router.push("/chat");
    }
  }, [status, router]);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse">
          <GraduationCap size={48} className="text-[var(--color-primary)]" />
        </div>
      </div>
    );
  }

  if (session) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-[var(--color-background)] to-[var(--color-surface)]">
      {/* Hero */}
      <div className="max-w-6xl mx-auto px-4 pt-20 pb-16">
        <nav className="flex justify-between items-center mb-20">
          <div className="flex items-center gap-2">
            <GraduationCap size={32} className="text-[var(--color-primary)]" />
            <span className="font-bold text-xl">EduCI</span>
          </div>
          <div className="flex gap-3">
            <Link href="/login">
              <Button variant="ghost">Connexion</Button>
            </Link>
            <Link href="/register">
              <Button>Inscription</Button>
            </Link>
          </div>
        </nav>

        <div className="text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)] text-sm font-medium mb-6">
            <span>🇨🇮</span>
            Programme scolaire ivoirien
          </div>
          <h1 className="text-4xl md:text-6xl font-bold mb-6 leading-tight">
            Apprends avec l&apos;
            <span className="text-[var(--color-primary)]">Intelligence Artificielle</span>
          </h1>
          <p className="text-lg text-[var(--color-muted)] mb-10 max-w-2xl mx-auto">
            Ton assistant éducatif intelligent qui t&apos;aide à comprendre tes
            cours, faire des exercices et préparer tes examens selon le programme
            ivoirien.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/register">
              <Button size="lg" className="gap-2">
                Commencer gratuitement
                <ArrowRight size={18} />
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Features */}
      <div className="max-w-6xl mx-auto px-4 py-20">
        <h2 className="text-2xl font-bold text-center mb-12">
          Tout ce dont tu as besoin pour réussir
        </h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            {
              icon: <MessageSquare size={24} />,
              title: "Chat Intelligent",
              desc: "Pose tes questions et obtiens des explications claires adaptées à ton niveau.",
            },
            {
              icon: <ClipboardCheck size={24} />,
              title: "Exercices",
              desc: "Des exercices générés automatiquement avec correction étape par étape.",
            },
            {
              icon: <BookOpen size={24} />,
              title: "Correction",
              desc: "Soumets ton travail et reçois une correction détaillée avec une note.",
            },
            {
              icon: <Brain size={24} />,
              title: "Quiz & Révision",
              desc: "Des quiz interactifs et des fiches de révision pour préparer tes examens.",
            },
          ].map((feature, i) => (
            <div
              key={i}
              className="p-6 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-primary)] transition-colors"
            >
              <div className="w-12 h-12 rounded-lg bg-[var(--color-primary)]/10 text-[var(--color-primary)] flex items-center justify-center mb-4">
                {feature.icon}
              </div>
              <h3 className="font-semibold mb-2">{feature.title}</h3>
              <p className="text-sm text-[var(--color-muted)]">{feature.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Subjects */}
      <div className="max-w-6xl mx-auto px-4 py-16">
        <h2 className="text-2xl font-bold text-center mb-8">
          Toutes les matières du programme ivoirien
        </h2>
        <div className="flex flex-wrap justify-center gap-3">
          {[
            { icon: "📐", name: "Mathématiques" },
            { icon: "📖", name: "Français" },
            { icon: "⚗️", name: "Physique-Chimie" },
            { icon: "🌿", name: "SVT" },
            { icon: "🌍", name: "Histoire-Géo" },
            { icon: "🤔", name: "Philosophie" },
            { icon: "🇬🇧", name: "Anglais" },
          ].map((subject, i) => (
            <div
              key={i}
              className="flex items-center gap-2 px-4 py-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-sm"
            >
              <span>{subject.icon}</span>
              {subject.name}
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-[var(--color-border)] py-8">
        <p className="text-center text-sm text-[var(--color-muted)]">
          &copy; {new Date().getFullYear()} EduCI — EdTech africaine propulsée par l&apos;IA
        </p>
      </footer>
    </div>
  );
}
