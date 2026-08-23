"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

interface UserInfo {
  id: string;
  name: string | null;
  email: string;
  role: string;
  gradeLevel: string | null;
  createdAt: string;
  _count: { conversations: number };
}

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
                <th className="text-left px-4 py-3 font-medium">Rôle</th>
                <th className="text-left px-4 py-3 font-medium">Niveau</th>
                <th className="text-left px-4 py-3 font-medium">Conversations</th>
                <th className="text-left px-4 py-3 font-medium">Inscrit le</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-[var(--color-surface-hover)]">
                  <td className="px-4 py-3">{user.name ?? "—"}</td>
                  <td className="px-4 py-3 text-[var(--color-muted)]">
                    {user.email}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        user.role === "ADMIN"
                          ? "bg-purple-500/10 text-purple-500"
                          : "bg-blue-500/10 text-blue-500"
                      }`}
                    >
                      {user.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">{user.gradeLevel ?? "—"}</td>
                  <td className="px-4 py-3">{user._count.conversations}</td>
                  <td className="px-4 py-3 text-[var(--color-muted)]">
                    {new Date(user.createdAt).toLocaleDateString("fr-FR")}
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
