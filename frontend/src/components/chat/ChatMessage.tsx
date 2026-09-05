"use client";

import { useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { cn } from "@/lib/utils";
import { normalizeMathContent, useFitKatexDisplays } from "@/lib/markdown";
import { Sparkles } from "lucide-react";

interface ChatMessageProps {
  content: string;
  role: "user" | "assistant";
  isStreaming?: boolean;
}

export default function ChatMessage({
  content,
  role,
  isStreaming,
}: ChatMessageProps) {
  const isUser = role === "user";
  const contentRef = useRef<HTMLDivElement>(null);
  // Re-mesure après chaque mise à jour du texte (y compris pendant le
  // streaming, une fois une formule complète reçue) et à chaque
  // redimensionnement — voir fitKatexDisplaysToWidth() dans lib/markdown.ts.
  useFitKatexDisplays(contentRef, [content]);

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
          ref={contentRef}
          className={cn(
            "prose-chat text-[15px] leading-relaxed text-[var(--color-foreground)]",
            isStreaming && "typing-cursor"
          )}
        >
          <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
            {normalizeMathContent(content)}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
