"use client";

import { signIn } from "next-auth/react";
import { GraduationCap } from "lucide-react";
import Button from "@/components/ui/Button";

// Authentification déléguée entièrement à Keycloak (realm "educi") — plus de
// formulaire email/mot de passe local. Voir src/lib/auth.ts pour la config
// du provider, et keycloak/realm-export.json pour les comptes disponibles.
export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--color-background)] px-4">
      <div className="max-w-md w-full text-center space-y-6">
        <GraduationCap size={48} className="mx-auto text-[var(--color-primary)]" />
        <h1 className="text-2xl font-bold">Ivoir&apos;Académie</h1>
        <p className="text-[var(--color-muted)]">
          Connecte-toi avec ton compte établissement pour accéder à tes cours.
        </p>
        <Button onClick={() => signIn("keycloak", { callbackUrl: "/chat" })} className="w-full">
          Se connecter
        </Button>
      </div>
    </div>
  );
}
