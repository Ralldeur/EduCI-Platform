"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import ChatMessage from "@/components/chat/ChatMessage";
import { getSubjectLabel, getGradeLevelLabel } from "@/lib/utils";
import type { Conversation } from "@/types";

// Détail en LECTURE SEULE d'une conversation d'un autre utilisateur — pas de
// ChatInput ici (aucune réponse possible) et pas de bouton supprimer,
// contrairement à /chat/[conversationId] qui gère la conversation courante
// de l'utilisateur connecté. Voir consigne produit.
export default function AdminConversationDetailPage() {
  const params = useParams();
  const userId = params.userId as string;
  const conversationId = params.id as string;

  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/admin/conversations/${conversationId}`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? "Erreur");
        setConversation(data);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [conversationId]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 size={24} className="animate-spin text-[var(--color-primary)]" />
      </div>
    );
  }

  if (error || !conversation) {
    return (
      <div>
        <Link
          href={`/admin/users/${userId}/conversations`}
          className="inline-flex items-center gap-1.5 text-sm text-[var(--color-muted)] hover:text-[var(--color-foreground)] mb-4"
        >
          <ArrowLeft size={14} />
          Retour aux conversations
        </Link>
        <p className="text-sm text-red-500">{error ?? "Conversation introuvable"}</p>
      </div>
    );
  }

  return (
    <div>
      <Link
        href={`/admin/users/${userId}/conversations`}
        className="inline-flex items-center gap-1.5 text-sm text-[var(--color-muted)] hover:text-[var(--color-foreground)] mb-4"
      >
        <ArrowLeft size={14} />
        Retour aux conversations
      </Link>

      <h1 className="text-2xl font-bold mb-1">{conversation.title ?? "Sans titre"}</h1>
      <p className="text-sm text-[var(--color-muted)] mb-6">
        {[
          conversation.subject ? getSubjectLabel(conversation.subject) : null,
          conversation.gradeLevel ? getGradeLevelLabel(conversation.gradeLevel) : null,
          new Date(conversation.createdAt).toLocaleString("fr-FR"),
        ]
          .filter(Boolean)
          .join(" · ")}
        {" · Lecture seule"}
      </p>

      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
        {conversation.messages.length === 0 ? (
          <p className="text-center py-8 text-sm text-[var(--color-muted)]">
            Cette conversation ne contient aucun message
          </p>
        ) : (
          conversation.messages.map((msg) => (
            <ChatMessage key={msg.id} content={msg.content} role={msg.role as "user" | "assistant"} />
          ))
        )}
      </div>
    </div>
  );
}
