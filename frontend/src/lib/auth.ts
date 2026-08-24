import { type NextAuthOptions } from "next-auth";
import KeycloakProvider from "next-auth/providers/keycloak";
import { getToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";

// Authentification déléguée à Keycloak (realm "educi") au lieu de
// Credentials+Prisma+bcrypt. Voir keycloak/realm-export.json à la racine du
// repo pour la config du realm, des rôles (ROLE_STUDENT/TEACHER/ADMIN) et des
// attributs personnalisés (grade_level, bac_series) exposés dans le token.
//
// Variables d'environnement requises (voir .env.example) :
//   KEYCLOAK_CLIENT_ID     — "educi-frontend" (client public, PKCE)
//   KEYCLOAK_CLIENT_SECRET — vide/non utilisé pour un client public ; laisser
//                            une valeur factice si NextAuth l'exige, sinon
//                            passer le client en "confidential" côté Keycloak
//                            et renseigner le vrai secret ici.
//   KEYCLOAK_ISSUER        — "http://localhost:8080/realms/educi"

/**
 * Demande un nouvel access_token à Keycloak à partir du refresh_token,
 * quand l'access_token courant a expiré. Sans ça, l'utilisateur se
 * retrouve déconnecté (401 en cascade sur toutes les routes /api/*) au
 * bout de la durée de vie de l'access_token (5-15 min par défaut côté
 * Keycloak), même si sa session NextAuth (cookie) est, elle, toujours
 * valide (30 jours par défaut) — ce qui est très déroutant pour
 * l'utilisateur (voir observé le 23/08 : conversations qui "disparaissent"
 * après quelques minutes d'usage).
 */
async function refreshAccessToken(token: any) {
  try {
    const url = `${process.env.KEYCLOAK_ISSUER}/protocol/openid-connect/token`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.KEYCLOAK_CLIENT_ID!,
        client_secret: process.env.KEYCLOAK_CLIENT_SECRET ?? "",
        grant_type: "refresh_token",
        refresh_token: token.refreshToken,
      }),
    });

    const refreshed = await res.json();
    if (!res.ok) throw refreshed;

    return {
      ...token,
      accessToken: refreshed.access_token,
      // expires_in est en secondes ; on stocke un timestamp absolu en ms
      // pour pouvoir comparer facilement à Date.now() à chaque requête.
      accessTokenExpires: Date.now() + refreshed.expires_in * 1000,
      // Keycloak peut renvoyer un nouveau refresh_token (rotation) ; s'il
      // n'en renvoie pas, on garde l'ancien.
      refreshToken: refreshed.refresh_token ?? token.refreshToken,
    };
  } catch (err) {
    console.error("[auth] échec du rafraîchissement du token Keycloak:", err);
    // On marque le token en erreur plutôt que de planter — les routes API
    // qui utilisent getAccessToken() verront un accessToken potentiellement
    // périmé et le gateway renverra 401, ce qui forcera une reconnexion
    // propre côté utilisateur plutôt qu'un crash serveur.
    return { ...token, error: "RefreshAccessTokenError" };
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    KeycloakProvider({
      clientId: process.env.KEYCLOAK_CLIENT_ID!,
      clientSecret: process.env.KEYCLOAK_CLIENT_SECRET ?? "",
      issuer: process.env.KEYCLOAK_ISSUER,
    }),
  ],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    // À la connexion, `account` contient le token Keycloak (access_token,
    // refresh_token, expires_at...) et `profile` les claims du token (sub,
    // roles, grade_level, bac_series...). On les recopie dans le JWT
    // NextAuth pour pouvoir les relire côté serveur, et on rafraîchit
    // automatiquement l'access_token à chaque appel une fois expiré.
    async jwt({ token, account, profile }) {
      // Connexion initiale : `account` n'est présent qu'à ce moment-là.
      if (account && profile) {
        token.id = profile.sub;
        token.accessToken = account.access_token;
        token.idToken = account.id_token;
        token.refreshToken = account.refresh_token;
        // account.expires_at est un timestamp Unix en SECONDES (fourni par
        // next-auth à partir de expires_in) ; on le convertit en ms.
        token.accessTokenExpires = (account.expires_at as number) * 1000;

        const p = profile as unknown as {
          realm_access?: { roles?: string[] };
          grade_level?: string | null;
          bac_series?: string | null;
        };
        token.roles = p.realm_access?.roles ?? [];
        token.gradeLevel = p.grade_level ?? null;
        token.serie = p.bac_series ?? null;

        return token;
      }

      // Appels suivants : si l'access_token est encore valide (avec 30s de
      // marge de sécurité), on ne touche à rien.
      if (Date.now() < (token.accessTokenExpires as number) - 30_000) {
        return token;
      }

      // Access_token expiré (ou sur le point de l'être) : on le rafraîchit.
      return refreshAccessToken(token);
    },
    async session({ session, token }) {
      if (session.user) {
        const s = session.user as unknown as {
          id: string;
          roles: string[];
          gradeLevel: string | null;
          serie: string | null;
        };
        s.id = token.id as string;
        s.roles = (token.roles as string[]) ?? [];
        s.gradeLevel = (token.gradeLevel as string | null) ?? null;
        s.serie = (token.serie as string | null) ?? null;
      }
      // Le access_token Keycloak est nécessaire côté serveur (routes API du
      // frontend) pour appeler le gateway en tant qu'utilisateur authentifié.
      // On NE l'expose PAS ici sur `session` (qui atterrit côté client) —
      // voir getAccessToken() plus bas pour le récupérer uniquement côté
      // serveur via getToken().
      //
      // Si le rafraîchissement a échoué (refreshAccessToken ci-dessus), on
      // le signale sur la session pour qu'un composant client puisse un
      // jour détecter l'erreur et forcer une reconnexion propre plutôt que
      // de laisser l'utilisateur face à des 401 silencieux.
      if ((token as any).error) {
        (session as any).error = (token as any).error;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  secret: process.env.NEXTAUTH_SECRET,
};

/**
 * Récupère le access_token Keycloak de l'utilisateur courant, UNIQUEMENT
 * côté serveur (route handlers du dossier src/app/api/). Ne jamais faire
 * l'équivalent côté client : le token ne doit jamais transiter vers le
 * navigateur au-delà du cookie de session chiffré de NextAuth.
 *
 * Le rafraîchissement automatique (voir refreshAccessToken ci-dessus) se
 * déclenche à l'intérieur du callback `jwt`, donc le token retourné ici est
 * déjà à jour au moment de l'appel — pas besoin de vérifier l'expiration
 * séparément à cet endroit.
 *
 * Utilisé pour relayer les appels vers le gateway (Authorization: Bearer ...)
 * depuis les routes API du frontend — voir src/app/api/chat/route.ts et
 * src/app/api/conversations/route.ts.
 */
export async function getAccessToken(req: NextRequest): Promise<string | undefined> {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  return token?.accessToken as string | undefined;
}
