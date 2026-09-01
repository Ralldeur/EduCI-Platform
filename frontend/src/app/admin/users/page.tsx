"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, MessageSquare } from "lucide-react";
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

const ROLE_STYLES: Record<string, string> = {
  ROLE_ADMIN: "bg-purple-500/10 text-purple-500",
  ROLE_TEACHER: "bg-orange-500/10 text-orange-500",
  ROLE_STUDENT: "bg-blue-500/10 text-blue-500",
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [loading, setLoading] = useState(true);

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

      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
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
                            ROLE_STYLES[role] ?? "bg-gray-500/10 text-gray-500"
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
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/users/${user.id}/conversations?name=${encodeURIComponent(user.name ?? user.username)}`}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-[var(--color-primary)] hover:bg-[var(--color-surface-hover)] transition-colors"
                      title="Consulter les conversations"
                    >
                      <MessageSquare size={14} />
                      Conversations
                    </Link>
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
