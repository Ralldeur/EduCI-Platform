"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { ArrowLeft, User } from "lucide-react";
import toast from "react-hot-toast";
import EduCILogo from "@/components/icons/EduCILogo";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

// Seul le prénom affiché est modifiable ici, jamais le username (identifiant
// de connexion) : "editUsernameAllowed": false dans
// keycloak/realm-export.json bloque ce changement côté Keycloak lui-même.
// La sauvegarde passe par src/app/api/settings/route.ts (API Account de
// Keycloak, avec le propre access_token de l'élève), puis la session
// NextAuth est rafraîchie via update() — pas besoin de se reconnecter.
export default function SettingsPage() {
  const { data: session, status, update } = useSession();
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  useEffect(() => {
    if (session?.user?.firstName) {
      setFirstName(session.user.firstName);
    }
  }, [session?.user?.firstName]);

  const initialFirstName = session?.user?.firstName ?? "";
  const trimmed = firstName.trim();
  const isUnchanged = trimmed === initialFirstName;

  const handleSave = async () => {
    if (!trimmed) {
      toast.error("Le prénom ne peut pas être vide");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName: trimmed }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        toast.error(data.error ?? "Erreur lors de l'enregistrement");
        return;
      }

      // Répercute immédiatement le nouveau prénom sur la session NextAuth
      // (callback jwt, trigger "update" — voir src/lib/auth.ts), qui force
      // aussi un rafraîchissement de l'access_token pour que l'IA (chat)
      // utilise le nouveau prénom dès le prochain message.
      await update({ firstName: trimmed });
      toast.success("Prénom mis à jour");
    } catch {
      toast.error("Erreur lors de l'enregistrement");
    } finally {
      setSaving(false);
    }
  };

  if (status === "loading" || !session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-background)]">
        <div className="animate-pulse">
          <EduCILogo width={40} height={40} className="text-[var(--color-primary)]" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-background)]">
      <header className="border-b border-[var(--color-border)] px-4 py-3">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <button
            onClick={() => router.push("/chat")}
            className="p-1.5 -ml-1.5 rounded-[var(--radius-sm)] text-[var(--color-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-foreground)] transition-colors cursor-pointer"
            aria-label="Retour au chat"
          >
            <ArrowLeft size={18} />
          </button>
          <h1 className="font-semibold text-[15px] tracking-tight">Paramètres</h1>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-8">
        <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-raised)] shadow-[var(--shadow-md)] p-6">
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-7 h-7 rounded-[var(--radius-sm)] bg-[var(--color-primary-subtle)] text-[var(--color-primary)] flex items-center justify-center flex-shrink-0">
              <User size={14} />
            </div>
            <h2 className="text-lg font-semibold tracking-tight">Profil</h2>
          </div>
          <p className="text-sm text-[var(--color-muted)] leading-relaxed mb-5">
            C&apos;est le prénom que l&apos;assistant IA utilisera pour s&apos;adresser à toi
            dans le chat.
          </p>

          <Input
            label="Prénom affiché"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            maxLength={255}
            placeholder="Ton prénom"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
            }}
          />

          <div className="flex justify-end mt-5">
            <Button
              onClick={handleSave}
              disabled={saving || isUnchanged || !trimmed}
            >
              {saving ? "Enregistrement..." : "Enregistrer"}
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
