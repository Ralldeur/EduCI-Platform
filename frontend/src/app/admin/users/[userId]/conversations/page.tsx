"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, MessageSquare } from "lucide-react";
import { getSubjectIcon, getSubjectLabel } from "@/lib/utils";
import type { ConversationSummary } from "@/types";

// Écran admin de consultation en LECTURE SEULE des conversations d'un
// utilisateur (voir /admin/users, bouton "Conversations"). Volontairement
// aucune action de suppression/modification ici, contrairement à la sidebar
// de /chat qui gère ses propres conversations — voir consigne produit.
export default function AdminUserConversationsPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const userId = params.userId as string;
  const userName = searchParams.get("name");

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/admin/conversations?userId=${encodeURIComponent(userId)}`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? "Erreur");
        setConversations(Array.isArray(data) ? data : []);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [userId]);

  return (
    <div>
      <Link
        href="/admin/users"
        className="inline-flex items-center gap-1.5 text-sm text-[var(--color-muted)] hover:text-[var(--color-foreground)] mb-4"
      >
        <ArrowLeft size={14} />
        Retour aux utilisateurs
      </Link>

      <h1 className="text-2xl font-bold mb-1">
        Conversations {userName ? `de ${userName}` : ""}
      </h1>
      <p className="text-sm text-[var(--color-muted)] mb-6">Consultation en lecture seule</p>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 size={24} className="animate-spin text-[var(--color-primary)]" />
        </div>
      ) : error ? (
        <p className="text-center py-8 text-sm text-red-500">{error}</p>
      ) : (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-hover)]">
                  <th className="text-left px-4 py-3 font-medium">Titre</th>
                  <th className="text-left px-4 py-3 font-medium">Matière</th>
                  <th className="text-left px-4 py-3 font-medium">Messages</th>
                  <th className="text-left px-4 py-3 font-medium">Dernière activité</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {conversations.map((conv) => (
                  <tr key={conv.id} className="hover:bg-[var(--color-surface-hover)]">
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/users/${userId}/conversations/${conv.id}`}
                        className="flex items-center gap-2 text-[var(--color-primary)] hover:underline"
                      >
                        <MessageSquare size={14} />
                        {conv.title ?? "Sans titre"}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-[var(--color-muted)]">
                      {conv.subject ? (
                        <span>
                          {getSubjectIcon(conv.subject)} {getSubjectLabel(conv.subject)}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-muted)]">{conv._count.messages}</td>
                    <td className="px-4 py-3 text-[var(--color-muted)]">
                      {new Date(conv.updatedAt).toLocaleString("fr-FR")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {conversations.length === 0 && (
            <p className="text-center py-8 text-sm text-[var(--color-muted)]">
              Aucune conversation pour cet utilisateur
            </p>
          )}
        </div>
      )}
    </div>
  );
}
