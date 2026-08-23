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
    // id_token...) et `profile` les claims du token (sub, roles, grade_level,
    // bac_series...). On les recopie dans le JWT NextAuth pour pouvoir les
    // relire côté serveur (ex. pour appeler le gateway avec le bon Bearer).
    async jwt({ token, account, profile }) {
      if (account && profile) {
        token.id = profile.sub;
        token.accessToken = account.access_token;
        token.idToken = account.id_token;

        // Les claims personnalisés (rôles, niveau, série) sont ajoutés au
        // token Keycloak via des protocol mappers (realm-export.json). Ils
        // arrivent ici dans `profile` sous forme de "any" côté TypeScript
        // (le type Profile de next-auth ne les connaît pas nativement).
        const p = profile as unknown as {
          realm_access?: { roles?: string[] };
          grade_level?: string | null;
          bac_series?: string | null;
        };
        token.roles = p.realm_access?.roles ?? [];
        token.gradeLevel = p.grade_level ?? null;
        token.serie = p.bac_series ?? null;
      }
      return token;
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
      // voir getServerAccessToken() dans ce même fichier pour le récupérer
      // uniquement côté serveur via getToken().
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
 * Utilisé pour relayer les appels vers le gateway (Authorization: Bearer ...)
 * depuis les routes API du frontend — voir src/app/api/chat/route.ts et
 * src/app/api/conversations/route.ts.
 */
export async function getAccessToken(req: NextRequest): Promise<string | undefined> {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  return token?.accessToken as string | undefined;
}
