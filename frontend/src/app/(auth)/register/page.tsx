import Link from "next/link";
import { GraduationCap } from "lucide-react";

// Auto-inscription désactivée pour l'instant (voir décision du 23/08 — la
// gestion des comptes passe par Keycloak, pas par un formulaire local). Les
// comptes sont créés par l'établissement (import en masse via
// frontend/scripts/migrate-users-to-keycloak.mjs, ou création manuelle dans
// la console Keycloak). À remplacer plus tard par l'auto-inscription Keycloak
// (KC_REGISTRATION_ALLOWED) ou un formulaire appelant l'API Admin Keycloak,
// si le produit en a besoin.
export default function RegisterPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--color-background)] px-4">
      <div className="max-w-md w-full text-center space-y-6">
        <GraduationCap size={48} className="mx-auto text-[var(--color-primary)]" />
        <h1 className="text-2xl font-bold">Créer un compte</h1>
        <p className="text-[var(--color-muted)]">
          Les comptes élèves sont créés par ton établissement. Contacte ton
          administration ou ton enseignant pour obtenir tes identifiants.
        </p>
        <Link
          href="/login"
          className="inline-block text-[var(--color-primary)] underline underline-offset-4"
        >
          J&apos;ai déjà un compte
        </Link>
      </div>
    </div>
  );
}
