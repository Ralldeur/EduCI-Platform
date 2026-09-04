"use client";

import { useState, useEffect, useLayoutEffect, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import ChatMessage from "@/components/chat/ChatMessage";
import ChatInput from "@/components/chat/ChatInput";
import ModeSelector from "@/components/chat/ModeSelector";
import { GraduationCap, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { normalizeGradeLevel } from "@/lib/utils";
import type { ChatMessage as ChatMessageType } from "@/types";

export default function ConversationPage() {
  const params = useParams();
  const conversationId = params.conversationId as string;

  const [messages, setMessages] = useState<ChatMessageType[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingConv, setIsLoadingConv] = useState(true);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [subject, setSubject] = useState("");
  const [gradeLevel, setGradeLevel] = useState("");
  const [serie, setSerie] = useState("");
  const [convMode, setConvMode] = useState("CHAT");
  const [streamingContent, setStreamingContent] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  // Le chargement des messages précédents préfixe la liste : on ne veut pas
  // que l'effet de scroll-vers-le-bas (ci-dessous) s'en mêle, la position est
  // gérée par le useLayoutEffect ci-dessous pour ne pas perdre le scroll.
  const skipNextAutoScrollRef = useRef(false);
  // Hauteur du conteneur de scroll juste avant qu'une page de messages plus
  // anciens soit préfixée ; non-null tant que le layout effect n'a pas encore
  // corrigé scrollTop pour ce chargement. Volontairement pas un
  // requestAnimationFrame : celui-ci ne se déclenche pas tant que l'onglet
  // n'est pas au premier plan (visible/focus), ce qui laisserait la vue
  // sauter en arrière-plan — un useLayoutEffect s'exécute de façon
  // synchrone après le commit DOM, avant le paint, sans cette dépendance.
  const pendingScrollRestoreRef = useRef<number | null>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useLayoutEffect(() => {
    if (pendingScrollRestoreRef.current !== null && scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      container.scrollTop = container.scrollHeight - pendingScrollRestoreRef.current;
      pendingScrollRestoreRef.current = null;
    }
  }, [messages]);

  useEffect(() => {
    if (skipNextAutoScrollRef.current) {
      skipNextAutoScrollRef.current = false;
      return;
    }
    scrollToBottom();
  }, [messages, streamingContent, scrollToBottom]);

  useEffect(() => {
    const fetchConversation = async () => {
      setIsLoadingConv(true);
      try {
        const res = await fetch(`/api/conversations/${conversationId}`);
        if (res.ok) {
          const data = await res.json();
          setMessages(data.messages ?? []);
          setHasMoreMessages(data.hasMore ?? false);
          setSubject(data.subject ?? "");
          // Défensif : certaines conversations existantes ont pu être créées
          // avant la normalisation (gradeLevel stocké en texte libre style
          // "Terminale D" plutôt qu'en code abrégé "TLE") — voir
          // normalizeGradeLevel() dans lib/utils.ts.
          setGradeLevel(normalizeGradeLevel(data.gradeLevel));
          setSerie(data.serie ?? "");
          setConvMode(data.mode ?? "CHAT");
        }
      } catch {
        toast.error("Erreur de chargement");
      } finally {
        setIsLoadingConv(false);
      }
    };

    fetchConversation();
  }, [conversationId]);

  const handleLoadMore = async () => {
    if (isLoadingMore || messages.length === 0) return;

    setIsLoadingMore(true);
    const oldestCreatedAt = messages[0].createdAt;
    const container = scrollContainerRef.current;
    pendingScrollRestoreRef.current = container?.scrollHeight ?? 0;

    try {
      const res = await fetch(
        `/api/conversations/${conversationId}?before=${encodeURIComponent(oldestCreatedAt)}`
      );
      if (!res.ok) {
        pendingScrollRestoreRef.current = null;
        toast.error("Erreur de chargement");
        return;
      }

      const data = await res.json();
      skipNextAutoScrollRef.current = true;
      setMessages((prev) => [...(data.messages ?? []), ...prev]);
      setHasMoreMessages(data.hasMore ?? false);
    } catch {
      pendingScrollRestoreRef.current = null;
      toast.error("Erreur de chargement");
    } finally {
      setIsLoadingMore(false);
    }
  };

  const handleSubjectChange = async (value: string) => {
    setSubject(value);
    await fetch(`/api/conversations/${conversationId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject: value }),
    }).catch(() => {});
  };

  const handleGradeLevelChange = async (value: string) => {
    setGradeLevel(value);
    await fetch(`/api/conversations/${conversationId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gradeLevel: value }),
    }).catch(() => {});
  };

  const handleSerieChange = async (value: string) => {
    setSerie(value);
    await fetch(`/api/conversations/${conversationId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ serie: value }),
    }).catch(() => {});
  };

  const handleSend = async (message: string) => {
    const userMessage: ChatMessageType = {
      id: `temp-${Date.now()}`,
      content: message,
      role: "user",
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);
    setStreamingContent("");

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, message }),
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error ?? "Erreur");
        setIsLoading(false);
        return;
      }

      const contentType = res.headers.get("content-type") ?? "";

      if (contentType.includes("text/event-stream")) {
        // Handle streaming response
        const reader = res.body?.getReader();
        const decoder = new TextDecoder();
        let fullContent = "";

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const text = decoder.decode(value);
            const lines = text.split("\n");

            for (const line of lines) {
              if (line.startsWith("data: ")) {
                try {
                  const data = JSON.parse(line.slice(6));
                  if (data.content) {
                    fullContent += data.content;
                    setStreamingContent(fullContent);
                  }
                  if (data.done) {
                    setMessages((prev) => [
                      ...prev,
                      {
                        id: data.messageId ?? `msg-${Date.now()}`,
                        content: fullContent,
                        role: "assistant",
                        createdAt: new Date().toISOString(),
                      },
                    ]);
                    setStreamingContent("");
                  }
                } catch {
                  // Skip malformed lines
                }
              }
            }
          }
        }
      } else {
        // Handle non-streaming response (demo mode)
        const data = await res.json();
        setMessages((prev) => [
          ...prev,
          {
            id: data.message?.id ?? `msg-${Date.now()}`,
            content: data.message?.content ?? "Erreur de réponse",
            role: "assistant",
            createdAt: new Date().toISOString(),
          },
        ]);
      }
    } catch {
      toast.error("Erreur de communication avec l'IA");
    } finally {
      setIsLoading(false);
    }
  };

  const getPlaceholder = () => {
    const placeholders: Record<string, string> = {
      CHAT: "Pose ta question...",
      EXERCISE: "Demande un exercice (ex: exercices sur les fractions)...",
      CORRECTION: "Colle ton exercice et ta réponse pour correction...",
      QUIZ: "Demande un quiz sur un sujet...",
      REVISION: "Quel sujet veux-tu réviser ?",
    };
    return placeholders[convMode] ?? placeholders.CHAT;
  };

  if (isLoadingConv) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-[var(--color-primary)]" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <ModeSelector
        subject={subject}
        gradeLevel={gradeLevel}
        serie={serie}
        onSubjectChange={handleSubjectChange}
        onGradeLevelChange={handleGradeLevelChange}
        onSerieChange={handleSerieChange}
      />

      {/* Messages */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto">
        {messages.length === 0 && !streamingContent ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="w-12 h-12 rounded-[var(--radius-lg)] bg-[var(--color-primary-subtle)] flex items-center justify-center mx-auto mb-4">
                <GraduationCap size={22} className="text-[var(--color-primary)]" />
              </div>
              <p className="text-sm text-[var(--color-muted)]">
                Commence la conversation en posant une question !
              </p>
            </div>
          </div>
        ) : (
          <>
            {hasMoreMessages && (
              <div className="flex justify-center py-3">
                <button
                  type="button"
                  onClick={handleLoadMore}
                  disabled={isLoadingMore}
                  className="text-xs font-medium text-[var(--color-muted)] hover:text-[var(--color-foreground)] disabled:opacity-50 cursor-pointer"
                >
                  {isLoadingMore ? "Chargement..." : "Charger les messages précédents"}
                </button>
              </div>
            )}
            {messages.map((msg) => (
              <ChatMessage
                key={msg.id}
                content={msg.content}
                role={msg.role as "user" | "assistant"}
              />
            ))}
            {streamingContent && (
              <ChatMessage
                content={streamingContent}
                role="assistant"
                isStreaming
              />
            )}
            {isLoading && !streamingContent && (
              <div className="flex gap-3 px-4 py-4 md:px-8">
                <div className="w-6 h-6 mt-0.5 rounded-[var(--radius-sm)] bg-[var(--color-primary-subtle)] flex items-center justify-center flex-shrink-0">
                  <Loader2 size={13} className="animate-spin text-[var(--color-primary)]" />
                </div>
                <div className="flex items-center">
                  <p className="text-sm text-[var(--color-muted)]">
                    EduCI réfléchit...
                  </p>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      <ChatInput
        onSend={handleSend}
        isLoading={isLoading}
        placeholder={getPlaceholder()}
      />
    </div>
  );
}
