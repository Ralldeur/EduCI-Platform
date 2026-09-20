"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, MessageSquare, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { getGradeLevelLabel } from "@/lib/utils";

interface UserInfo {
  id: string;
  username: string;
  name: string | null;
  email: string | null;
  roles: string[];
  gradeLevel: string | null;
  bacSeries: string | null;
  createdAt: string | null;
}

// Un seul accent par écran (voir DESIGN_SYSTEM.md) : ROLE_ADMIN est le seul
// rôle mis en avant avec `primary` (c'est celui qu'un admin consultant cette
// liste a besoin de repérer en un coup d'œil) ; les autres restent neutres
// plutôt que d'utiliser plusieurs couleurs concurrentes pour "décorer".
const ROLE_STYLES: Record<string, string> = {
  ROLE_ADMIN: "bg-[var(--color-primary-subtle)] text-[var(--color-primary)]",
  ROLE_TEACHER: "bg-[var(--color-surface-hover)] text-[var(--color-foreground)]",
  ROLE_STUDENT: "bg-[var(--color-surface-hover)] text-[var(--color-foreground)]",
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Suppression définitive du compte Keycloak (pas une désactivation) —
  // voir src/app/api/admin/users/[userId]/route.ts. Ne touche pas aux
  // conversations déjà enregistrées de cet utilisateur.
  const handleDelete = async (user: UserInfo) => {
    const label = user.name ?? user.username;
    if (
      !confirm(
        `Supprimer définitivement le compte de "${label}" (${user.email ?? user.username}) ? Cette action est irréversible.`
      )
    ) {
      return;
    }
    setDeletingId(user.id);

    try {
      const res = await fetch(`/api/admin/users/${user.id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success(`Compte de "${label}" supprimé`);
        setUsers((prev) => prev.filter((u) => u.id !== user.id));
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Erreur lors de la suppression");
      }
    } catch {
      toast.error("Erreur de connexion");
    } finally {
      setDeletingId(null);
    }
  };

  useEffect(() => {
    fetch("/api/admin/users")
      .then((r) => r.json())
      .then((data) => setUsers(Array.isArray(data) ? data : []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 size={24} className="animate-spin text-[var(--color-primary)]" />
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Utilisateurs</h1>

      <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-hover)]">
                <th className="text-left px-4 py-3 font-medium">Nom</th>
                <th className="text-left px-4 py-3 font-medium">Email</th>
                <th className="text-left px-4 py-3 font-medium">Rôles</th>
                <th className="text-left px-4 py-3 font-medium">Niveau / Série</th>
                <th className="text-left px-4 py-3 font-medium">Inscrit le</th>
                <th className="text-right px-4 py-3 font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-[var(--color-surface-hover)]">
                  <td className="px-4 py-3">{user.name ?? user.username}</td>
                  <td className="px-4 py-3 text-[var(--color-muted)]">{user.email ?? "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {user.roles.length === 0 && <span className="text-[var(--color-muted)]">—</span>}
                      {user.roles.map((role) => (
                        <span
                          key={role}
                          className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            ROLE_STYLES[role] ??
                            "bg-[var(--color-surface-hover)] text-[var(--color-muted)]"
                          }`}
                        >
                          {role}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {user.gradeLevel ? getGradeLevelLabel(user.gradeLevel) : "—"}
                    {user.bacSeries ? ` (Série ${user.bacSeries})` : ""}
                  </td>
                  <td className="px-4 py-3 text-[var(--color-muted)]">
                    {user.createdAt ? new Date(user.createdAt).toLocaleDateString("fr-FR") : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Link
                        href={`/admin/users/${user.id}/conversations?name=${encodeURIComponent(user.name ?? user.username)}`}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-[var(--radius-md)] text-xs font-medium text-[var(--color-primary)] hover:bg-[var(--color-surface-hover)] transition-colors"
                        title="Consulter les conversations"
                      >
                        <MessageSquare size={14} />
                        Conversations
                      </Link>
                      <button
                        onClick={() => handleDelete(user)}
                        disabled={deletingId === user.id}
                        className="p-1.5 rounded-[var(--radius-sm)] hover:bg-[var(--color-danger-subtle)] hover:text-[var(--color-danger)] text-[var(--color-muted)] transition-colors cursor-pointer disabled:opacity-50"
                        title="Supprimer ce compte"
                      >
                        {deletingId === user.id ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Trash2 size={14} />
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {users.length === 0 && (
          <p className="text-center py-8 text-sm text-[var(--color-muted)]">
            Aucun utilisateur
          </p>
        )}
      </div>
    </div>
  );
}
