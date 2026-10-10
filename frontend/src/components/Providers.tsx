"use client";

import { SessionProvider, signOut, useSession } from "next-auth/react";
import { ThemeProvider } from "next-themes";
import { Toaster } from "react-hot-toast";
import { ReactNode, useEffect, useRef } from "react";

function ExpiredSessionHandler() {
  const { data: session } = useSession();
  const redirecting = useRef(false);

  useEffect(() => {
    if (session?.error !== "RefreshAccessTokenError" || redirecting.current) return;
    redirecting.current = true;

    void (async () => {
      try {
        const response = await fetch("/api/auth/keycloak-logout-url");
        if (!response.ok) throw new Error("Impossible de terminer la session Keycloak");
        const { logoutUrl } = await response.json();
        await signOut({ redirect: false });
        window.location.assign(logoutUrl);
      } catch {
        await signOut({ callbackUrl: "/login" });
      }
    })();
  }, [session?.error]);

  return null;
}

export default function Providers({ children }: { children: ReactNode }) {
  return (
    // refetchInterval : revérifie la session chaque minute, ce qui
    // déclenche le callback jwt() côté serveur (voir src/lib/auth.ts) et
    // rafraîchit proactivement le access_token Keycloak avant son
    // expiration (5-15 min par défaut côté Keycloak). Si le refresh token
    // n'est plus valide, ExpiredSessionHandler termine proprement la session.
    // Sans ça, un
    // utilisateur resté actif dans le même onglet sans jamais perdre le
    // focus de la fenêtre finissait par voir toutes ses requêtes échouer en
    // 401 une fois le token expiré (observé le 23/08 — les conversations
    // « disparaissaient » après quelques minutes d'usage).
    <SessionProvider refetchInterval={60} refetchOnWindowFocus>
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
        <ExpiredSessionHandler />
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
