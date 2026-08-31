"use client";

import { useSession } from "next-auth/react";
import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";
import Link from "next/link";
import {
  GraduationCap,
  LayoutDashboard,
  BookOpen,
  Users,
  ArrowLeft,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/admin", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/admin/lessons", icon: BookOpen, label: "Leçons" },
  { href: "/admin/users", icon: Users, label: "Utilisateurs" },
];

// /admin reconstruit sur l'architecture microservices (Keycloak Admin API
// pour les utilisateurs, chat-service/ml-service pour les stats) — voir
// cahier-des-charges-admin.md. session.user.roles est un tableau (format
// Keycloak, ex. ["ROLE_STUDENT"]) : voir src/types/next-auth.d.ts.
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  const isAdmin = session?.user?.roles?.includes("ROLE_ADMIN") ?? false;

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    } else if (status === "authenticated" && !isAdmin) {
      router.push("/chat");
    }
  }, [status, isAdmin, router]);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-[var(--color-primary)]" />
      </div>
    );
  }

  if (!session || !isAdmin) return null;

  return (
    <div className="min-h-screen bg-[var(--color-background)]">
      <header className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/chat">
              <ArrowLeft
                size={18}
                className="text-[var(--color-muted)] hover:text-[var(--color-foreground)]"
              />
            </Link>
            <GraduationCap size={24} className="text-[var(--color-primary)]" />
            <span className="font-bold">Administration</span>
          </div>
        </div>
        <div className="max-w-6xl mx-auto px-4">
          <nav className="flex gap-1">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 text-sm rounded-t-lg transition-colors",
                  pathname === item.href
                    ? "bg-[var(--color-background)] text-[var(--color-primary)] font-medium border-b-2 border-[var(--color-primary)]"
                    : "text-[var(--color-muted)] hover:text-[var(--color-foreground)]"
                )}
              >
                <item.icon size={16} />
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-8">{children}</main>
    </div>
  );
}
