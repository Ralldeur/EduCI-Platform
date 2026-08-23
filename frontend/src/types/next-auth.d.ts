import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string | null;
      // Format Keycloak : un tableau de rôles ("ROLE_STUDENT", "ROLE_ADMIN"...),
      // contrairement à l'ancien champ `role` (singulier) de Prisma.
      roles: string[];
      gradeLevel: string | null;
      serie: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    roles: string[];
    gradeLevel: string | null;
    serie: string | null;
    // access_token / id_token Keycloak, gardés côté serveur uniquement
    // (voir getAccessToken() dans src/lib/auth.ts) — jamais exposés dans
    // Session, qui elle est accessible côté client.
    accessToken?: string;
    idToken?: string;
  }
}
