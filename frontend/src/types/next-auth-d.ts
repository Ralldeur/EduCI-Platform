import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string | null;
      roles: string[];
      gradeLevel: string | null;
      serie: string | null;
    };
    // Présent uniquement si le rafraîchissement du token Keycloak a échoué
    // (voir refreshAccessToken dans src/lib/auth.ts) — permet à un composant
    // client de détecter le problème et de forcer une reconnexion propre.
    error?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    roles: string[];
    gradeLevel: string | null;
    serie: string | null;
    // access_token / id_token / refresh_token Keycloak, gardés côté serveur
    // uniquement (voir getAccessToken() dans src/lib/auth.ts) — jamais
    // exposés dans Session, qui elle est accessible côté client.
    accessToken?: string;
    idToken?: string;
    refreshToken?: string;
    // Timestamp Unix en millisecondes (Date.now()) auquel accessToken expire.
    accessTokenExpires?: number;
    // Présent si refreshAccessToken() a échoué (voir src/lib/auth.ts).
    error?: string;
  }
}
