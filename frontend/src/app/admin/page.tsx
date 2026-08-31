"use client";

import { useEffect, useState } from "react";
import { Users, MessageSquare, MessageCircle, Database } from "lucide-react";

interface Stats {
  totalUsers: number;
  totalConversations: number;
  totalMessages: number;
  totalDocuments: number;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetch("/api/admin/stats")
      .then((r) => r.json())
      .then(setStats)
      .catch(console.error);
  }, []);

  if (!stats) {
    return <p className="text-[var(--color-muted)]">Chargement...</p>;
  }

  const cards = [
    { icon: Users, label: "Utilisateurs", value: stats.totalUsers, color: "text-blue-500" },
    { icon: MessageSquare, label: "Conversations", value: stats.totalConversations, color: "text-green-500" },
    { icon: MessageCircle, label: "Messages", value: stats.totalMessages, color: "text-purple-500" },
    { icon: Database, label: "Documents indexés (RAG)", value: stats.totalDocuments, color: "text-orange-500" },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card, i) => (
          <div
            key={i}
            className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]"
          >
            <card.icon size={20} className={card.color} />
            <p className="text-2xl font-bold mt-2">{card.value}</p>
            <p className="text-xs text-[var(--color-muted)]">{card.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
