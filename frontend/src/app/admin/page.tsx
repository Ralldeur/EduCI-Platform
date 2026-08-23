"use client";

import { useEffect, useState } from "react";
import {
  Users,
  MessageSquare,
  BookOpen,
  ClipboardCheck,
  MessageCircle,
  Globe,
  RefreshCw,
  Database,
  Loader2,
} from "lucide-react";

interface Stats {
  totalUsers: number;
  totalConversations: number;
  totalMessages: number;
  totalLessons: number;
  totalExercises: number;
  recentUsers: Array<{
    id: string;
    name: string | null;
    email: string;
    createdAt: string;
  }>;
}

interface ScrapeStats {
  totalContent: number;
  bySource: Array<{ source: string; count: number }>;
  lastScrape: string | null;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [scrapeStats, setScrapeStats] = useState<ScrapeStats | null>(null);
  const [scraping, setScraping] = useState(false);
  const [scrapeResult, setScrapeResult] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/stats")
      .then((r) => r.json())
      .then(setStats)
      .catch(console.error);

    fetch("/api/admin/scrape")
      .then((r) => r.json())
      .then(setScrapeStats)
      .catch(console.error);
  }, []);

  const handleScrape = async () => {
    setScraping(true);
    setScrapeResult(null);
    try {
      const res = await fetch("/api/admin/scrape", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        const sourceDetails = Object.entries(data.sources as Record<string, number>)
          .map(([source, count]) => `${source}: ${count}`)
          .join(", ");
        setScrapeResult(`${data.totalItems} contenus récupérés (${sourceDetails})`);
        // Refresh stats
        const statsRes = await fetch("/api/admin/scrape");
        const newStats = await statsRes.json();
        setScrapeStats(newStats);
      } else {
        setScrapeResult("Erreur: " + (data.error ?? "Erreur inconnue"));
      }
    } catch {
      setScrapeResult("Erreur de connexion");
    } finally {
      setScraping(false);
    }
  };

  if (!stats) {
    return <p className="text-[var(--color-muted)]">Chargement...</p>;
  }

  const cards = [
    {
      icon: Users,
      label: "Utilisateurs",
      value: stats.totalUsers,
      color: "text-blue-500",
    },
    {
      icon: MessageSquare,
      label: "Conversations",
      value: stats.totalConversations,
      color: "text-green-500",
    },
    {
      icon: MessageCircle,
      label: "Messages",
      value: stats.totalMessages,
      color: "text-purple-500",
    },
    {
      icon: BookOpen,
      label: "Leçons",
      value: stats.totalLessons,
      color: "text-orange-500",
    },
    {
      icon: ClipboardCheck,
      label: "Exercices",
      value: stats.totalExercises,
      color: "text-pink-500",
    },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>

      <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
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

      {/* Scraping Section */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden mb-8">
        <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Globe size={18} className="text-cyan-500" />
            <h2 className="font-semibold">Agents de scraping IA</h2>
          </div>
          <button
            onClick={handleScrape}
            disabled={scraping}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-600 text-white text-sm font-medium hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {scraping ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <RefreshCw size={16} />
            )}
            {scraping ? "Scraping en cours..." : "Lancer le scraping"}
          </button>
        </div>
        <div className="p-4">
          <div className="grid sm:grid-cols-3 gap-4 mb-4">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-[var(--color-background)]">
              <Database size={18} className="text-cyan-500" />
              <div>
                <p className="text-lg font-bold">{scrapeStats?.totalContent ?? 0}</p>
                <p className="text-xs text-[var(--color-muted)]">Contenus en base</p>
              </div>
            </div>
            {scrapeStats?.bySource.map((s) => (
              <div key={s.source} className="flex items-center gap-3 p-3 rounded-lg bg-[var(--color-background)]">
                <Globe size={18} className="text-green-500" />
                <div>
                  <p className="text-lg font-bold">{s.count}</p>
                  <p className="text-xs text-[var(--color-muted)]">{s.source}</p>
                </div>
              </div>
            ))}
          </div>
          {scrapeStats?.lastScrape && (
            <p className="text-xs text-[var(--color-muted)]">
              Dernier scraping : {new Date(scrapeStats.lastScrape).toLocaleString("fr-FR")}
            </p>
          )}
          {scrapeResult && (
            <div className="mt-3 p-3 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
              <p className="text-sm text-cyan-400">{scrapeResult}</p>
            </div>
          )}
          <div className="mt-3">
            <p className="text-xs text-[var(--color-muted)]">
              Sources : education.gouv.ci, abidjan.net, Wikipedia FR — Les agents récupèrent les contenus éducatifs et les stockent pour enrichir les réponses de l&apos;IA.
            </p>
          </div>
        </div>
      </div>

      {/* Recent Users */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--color-border)]">
          <h2 className="font-semibold">Derniers utilisateurs inscrits</h2>
        </div>
        <div className="divide-y divide-[var(--color-border)]">
          {stats.recentUsers.map((user) => (
            <div key={user.id} className="px-4 py-3 flex justify-between">
              <div>
                <p className="text-sm font-medium">
                  {user.name ?? "Sans nom"}
                </p>
                <p className="text-xs text-[var(--color-muted)]">
                  {user.email}
                </p>
              </div>
              <p className="text-xs text-[var(--color-muted)]">
                {new Date(user.createdAt).toLocaleDateString("fr-FR")}
              </p>
            </div>
          ))}
          {stats.recentUsers.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-[var(--color-muted)]">
              Aucun utilisateur inscrit
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
