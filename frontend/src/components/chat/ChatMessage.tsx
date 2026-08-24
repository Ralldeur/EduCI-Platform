"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { cn } from "@/lib/utils";
import { Bot, User } from "lucide-react";

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

  return (
    <div
      className={cn(
        "flex gap-3 px-4 py-5 md:px-8",
        isUser
          ? "bg-[var(--color-chat-user)]"
          : "bg-[var(--color-chat-assistant)]"
      )}
    >
      <div
        className={cn(
          "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center",
          isUser
            ? "bg-[var(--color-primary)] text-white"
            : "bg-[var(--color-secondary)] text-white"
        )}
      >
        {isUser ? <User size={16} /> : <Bot size={16} />}
      </div>
      <div className="flex-1 min-w-0 overflow-hidden">
        <p
          className={cn(
            "text-xs font-medium mb-1",
            isUser ? "text-[var(--color-primary)]" : "text-[var(--color-secondary)]"
          )}
        >
          {isUser ? "Vous" : "Ivoir'Académie"}
        </p>
        <div className={cn("prose-chat text-sm leading-relaxed", isStreaming && "typing-cursor")}>
          {isUser ? (
            <p className="whitespace-pre-wrap">{content}</p>
          ) : (
            <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
              {content}
            </ReactMarkdown>
          )}
        </div>
      </div>
    </div>
  );
}
