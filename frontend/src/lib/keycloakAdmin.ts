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
const KEYCLOAK_ISSUER = process.env.KEYCLOAK_ISSUER!;
const KEYCLOAK_BASE_URL = KEYCLOAK_ISSUER.replace(/\/realms\/[^/]+$/, "");
const REALM = KEYCLOAK_ISSUER.split("/realms/")[1];

async function getServiceAccountToken(): Promise<string> {
  const res = await fetch(`${KEYCLOAK_ISSUER}/protocol/openid-connect/token`, {
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

  return fetch(`${KEYCLOAK_BASE_URL}/admin/realms/${REALM}${path}`, {
    ...init,
    headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${token}` },
  });
}
