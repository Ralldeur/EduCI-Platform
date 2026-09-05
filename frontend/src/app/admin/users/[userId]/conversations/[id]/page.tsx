"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
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
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  // Hauteur du document + position de scroll juste avant qu'une page de
  // messages plus anciens soit préfixée ; non-null tant que le layout effect
  // n'a pas encore corrigé le scroll pour ce chargement. Volontairement pas
  // un requestAnimationFrame : celui-ci ne se déclenche pas tant que l'onglet
  // n'est pas au premier plan (visible/focus), ce qui laisserait la vue
  // sauter en arrière-plan — un useLayoutEffect s'exécute de façon
  // synchrone après le commit DOM, avant le paint, sans cette dépendance.
  const pendingScrollRestoreRef = useRef<{ scrollHeight: number; scrollY: number } | null>(null);

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

  // Cette page (contrairement à /chat) défile au niveau du document, pas
  // d'un conteneur interne — on préserve donc la position via la hauteur du
  // document plutôt qu'un scrollTop de conteneur.
  useLayoutEffect(() => {
    if (pendingScrollRestoreRef.current) {
      const { scrollHeight, scrollY } = pendingScrollRestoreRef.current;
      const newScrollHeight = document.documentElement.scrollHeight;
      window.scrollTo(0, scrollY + (newScrollHeight - scrollHeight));
      pendingScrollRestoreRef.current = null;
    }
  }, [conversation?.messages]);

  const handleLoadMore = async () => {
    if (isLoadingMore || !conversation || conversation.messages.length === 0) return;

    setIsLoadingMore(true);
    const oldestCreatedAt = conversation.messages[0].createdAt;
    pendingScrollRestoreRef.current = {
      scrollHeight: document.documentElement.scrollHeight,
      scrollY: window.scrollY,
    };

    try {
      const res = await fetch(
        `/api/admin/conversations/${conversationId}?before=${encodeURIComponent(oldestCreatedAt)}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erreur");

      setConversation((prev) =>
        prev
          ? { ...prev, messages: [...data.messages, ...prev.messages], hasMore: data.hasMore }
          : prev
      );
    } catch {
      pendingScrollRestoreRef.current = null;
      toast.error("Erreur de chargement des messages précédents");
    } finally {
      setIsLoadingMore(false);
    }
  };

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
        <p className="text-sm text-[var(--color-danger)]">{error ?? "Conversation introuvable"}</p>
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

      <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
        {conversation.messages.length === 0 ? (
          <p className="text-center py-8 text-sm text-[var(--color-muted)]">
            Cette conversation ne contient aucun message
          </p>
        ) : (
          <>
            {conversation.hasMore && (
              <div className="flex justify-center py-3 border-b border-[var(--color-border)]">
                <button
                  type="button"
                  onClick={handleLoadMore}
                  disabled={isLoadingMore}
                  className="text-sm text-[var(--color-primary)] hover:underline disabled:opacity-50"
                >
                  {isLoadingMore ? "Chargement..." : "Charger les messages précédents"}
                </button>
              </div>
            )}
            {conversation.messages.map((msg) => (
              <ChatMessage key={msg.id} content={msg.content} role={msg.role as "user" | "assistant"} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
