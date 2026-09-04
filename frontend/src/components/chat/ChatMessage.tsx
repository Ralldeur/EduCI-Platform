"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { cn } from "@/lib/utils";
import { Sparkles } from "lucide-react";

interface ChatMessageProps {
  content: string;
  role: "user" | "assistant";
  isStreaming?: boolean;
}

/**
 * Le modèle écrit souvent les formules bloc sur une seule ligne
 * ("$$\frac{a}{b}$$"). remark-math ne reconnaît le mode "display" que si
 * $$ est isolé sur ses propres lignes (comme un fence de code) ; sinon il
 * traite la formule comme du math inline en style compact, ce qui rend les
 * fractions empilées illisibles. On force donc chaque bloc $$...$$ sur ses
 * propres lignes avant de passer le contenu à ReactMarkdown.
 */
function normalizeDisplayMath(text: string): string {
  return text.replace(
    /\$\$([\s\S]+?)\$\$/g,
    (_, formula: string) => `\n\n$$\n${formula.trim()}\n$$\n\n`
  );
}

/**
 * \frac utilise le style "cramped" de TeX pour son dénominateur : quand ce
 * dénominateur porte un exposant (ex. "0^+" pour une limite à droite), le
 * signe touche/chevauche la barre de fraction, surtout en math inline où
 * l'espacement est déjà compact. \dfrac force le style "display" (pleine
 * taille, non compact) partout, y compris en inline, ce qui règle ce
 * chevauchement sans rien changer visuellement là où \frac était déjà
 * correct.
 */
function forceDisplayFractions(text: string): string {
  return text.replace(/\\frac(?=\{)/g, "\\dfrac");
}

export default function ChatMessage({
  content,
  role,
  isStreaming,
}: ChatMessageProps) {
  const isUser = role === "user";

  if (isUser) {
    return (
      <div className="px-4 py-2.5 md:px-8 flex justify-end">
        <div className="max-w-[75%] rounded-[var(--radius-lg)] rounded-tr-[var(--radius-sm)] bg-[var(--color-chat-user)] border border-[var(--color-border)] px-4 py-2.5">
          <p className="text-sm leading-relaxed whitespace-pre-wrap text-[var(--color-foreground)]">
            {content}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3 px-4 py-4 md:px-8">
      <div className="flex-shrink-0 w-6 h-6 mt-0.5 rounded-[var(--radius-sm)] bg-[var(--color-primary-subtle)] flex items-center justify-center">
        <Sparkles size={13} className="text-[var(--color-primary)]" />
      </div>
      <div className="flex-1 min-w-0 overflow-hidden">
        <p className="text-xs font-medium mb-1.5 text-[var(--color-muted)]">
          EduCI
        </p>
        <div
          className={cn(
            "prose-chat text-[15px] leading-relaxed text-[var(--color-foreground)]",
            isStreaming && "typing-cursor"
          )}
        >
          <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
            {forceDisplayFractions(normalizeDisplayMath(content))}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
