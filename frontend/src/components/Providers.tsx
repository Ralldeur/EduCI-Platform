"use client";

import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "next-themes";
import { Toaster } from "react-hot-toast";
import { ReactNode } from "react";

export default function Providers({ children }: { children: ReactNode }) {
  return (
    // refetchInterval : revérifie la session toutes les 4 minutes, ce qui
    // déclenche le callback jwt() côté serveur (voir src/lib/auth.ts) et
    // rafraîchit proactivement le access_token Keycloak avant son
    // expiration (5-15 min par défaut côté Keycloak). Sans ça, un
    // utilisateur resté actif dans le même onglet sans jamais perdre le
    // focus de la fenêtre finissait par voir toutes ses requêtes échouer en
    // 401 une fois le token expiré (observé le 23/08 — les conversations
    // « disparaissaient » après quelques minutes d'usage).
    <SessionProvider refetchInterval={4 * 60} refetchOnWindowFocus>
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
        {children}
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: "var(--color-surface)",
              color: "var(--color-foreground)",
              border: "1px solid var(--color-border)",
            },
          }}
        />
      </ThemeProvider>
    </SessionProvider>
  );
}
