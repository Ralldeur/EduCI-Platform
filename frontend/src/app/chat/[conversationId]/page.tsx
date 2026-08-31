"use client";

import { useState, useEffect, useRef, useCallback } from "react";
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
  const [subject, setSubject] = useState("");
  const [gradeLevel, setGradeLevel] = useState("");
  const [serie, setSerie] = useState("");
  const [convMode, setConvMode] = useState("CHAT");
  const [streamingContent, setStreamingContent] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
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
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 && !streamingContent ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <GraduationCap
                size={48}
                className="mx-auto mb-4 text-[var(--color-primary)] opacity-30"
              />
              <p className="text-[var(--color-muted)]">
                Commence la conversation en posant une question !
              </p>
            </div>
          </div>
        ) : (
          <>
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
              <div className="flex gap-3 px-4 py-5 md:px-8 bg-[var(--color-chat-assistant)]">
                <div className="w-8 h-8 rounded-full bg-[var(--color-secondary)] text-white flex items-center justify-center flex-shrink-0">
                  <Loader2 size={16} className="animate-spin" />
                </div>
                <div className="flex items-center">
                  <p className="text-sm text-[var(--color-muted)]">
                    Ivoir&apos;Académie réfléchit...
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
