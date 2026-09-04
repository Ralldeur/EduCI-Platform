// Client pour l'API Admin de Keycloak (gestion des utilisateurs), appelée
// UNIQUEMENT côté serveur (routes du dossier src/app/api/admin/), jamais
// depuis le navigateur. Utilise un compte de service dédié
// ("educi-admin-service", client confidentiel avec le rôle manage-users),
// distinct du client "educi-frontend" (public, PKCE) utilisé pour la
// connexion des élèves/enseignants — voir keycloak/realm-export.json.
//
// KEYCLOAK_ISSUER est de la forme "http://keycloak.local:8080/realms/educi" ;
// l'API Admin, elle, vit sous /admin/realms/{realm}/... (pas sous /realms/{realm}),
// d'où l'extraction de KEYCLOAK_BASE_URL et REALM ci-dessous.
//
// Calculées à l'intérieur d'une fonction (pas au chargement du module) :
// Next.js importe ce module pendant `next build` (analyse statique des
// routes, "Collecting page data") SANS que le conteneur ait accès à un vrai
// .env (voir .dockerignore — les secrets ne doivent pas faire partie du
// contexte de build, voir audit sécurité). Un `process.env.KEYCLOAK_ISSUER!.
// replace(...)` exécuté au top-level plantait donc le build dès que
// KEYCLOAK_ISSUER était absent à ce moment-là, alors qu'il est bien défini
// au runtime (docker-compose.yml). Ce module n'est de toute façon appelé que
// côté serveur, jamais au moment du build.
function getKeycloakBaseUrl(): string {
  const issuer = process.env.KEYCLOAK_ISSUER!;
  return issuer.replace(/\/realms\/[^/]+$/, "");
}

function getRealm(): string {
  return process.env.KEYCLOAK_ISSUER!.split("/realms/")[1];
}

async function getServiceAccountToken(): Promise<string> {
  const res = await fetch(`${process.env.KEYCLOAK_ISSUER!}/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: process.env.KEYCLOAK_ADMIN_CLIENT_ID!,
      client_secret: process.env.KEYCLOAK_ADMIN_CLIENT_SECRET!,
    }),
  });

  if (!res.ok) {
    throw new Error(`échec d'obtention du token de service Keycloak (${res.status})`);
  }

  const data: { access_token: string } = await res.json();
  return data.access_token;
}

/**
 * Appelle l'API Admin Keycloak (`/admin/realms/{realm}/...`) authentifiée
 * avec le token du compte de service. `path` doit commencer par "/", ex.
 * "/users" ou "/users/count".
 */
export async function keycloakAdminFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = await getServiceAccountToken();

  return fetch(`${getKeycloakBaseUrl()}/admin/realms/${getRealm()}${path}`, {
    ...init,
    headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${token}` },
  });
}
