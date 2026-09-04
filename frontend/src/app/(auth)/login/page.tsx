"use client";

import { signIn } from "next-auth/react";
import { GraduationCap } from "lucide-react";
import Button from "@/components/ui/Button";

// Authentification déléguée entièrement à Keycloak (realm "educi") — plus de
// formulaire email/mot de passe local. Voir src/lib/auth.ts pour la config
// du provider, et keycloak/realm-export.json pour les comptes disponibles.
export default function LoginPage() {
  return (
    <div className="relative min-h-screen flex items-center justify-center bg-[var(--color-background)] px-4 overflow-hidden">
      {/* Fond très discret : un halo radial à peine visible, pas un dégradé */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(560px circle at 50% 32%, var(--color-primary-subtle), transparent 70%)",
        }}
      />

      <div className="relative w-full max-w-[380px]">
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="w-8 h-8 rounded-[var(--radius-sm)] bg-[var(--color-primary)] flex items-center justify-center">
            <GraduationCap size={18} className="text-[var(--color-primary-foreground)]" />
          </div>
          <span className="font-semibold text-[15px] tracking-tight">EduCI</span>
        </div>

        <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-raised)] shadow-[var(--shadow-md)] px-8 py-9 text-center">
          <h1 className="text-xl font-semibold tracking-tight mb-2">
            Connexion à ton espace
          </h1>
          <p className="text-sm text-[var(--color-muted)] leading-relaxed mb-7">
            Connecte-toi avec ton compte établissement pour accéder à tes cours.
          </p>
          <Button onClick={() => signIn("keycloak", { callbackUrl: "/chat" })} className="w-full" size="lg">
            Se connecter
          </Button>
        </div>

        <p className="text-center text-xs text-[var(--color-muted-subtle)] mt-6">
          Programme scolaire ivoirien · MENA/DPFC
        </p>
      </div>
    </div>
  );
}
