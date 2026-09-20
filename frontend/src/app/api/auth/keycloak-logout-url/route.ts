import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

// Construit l'URL de déconnexion Keycloak (end_session_endpoint) à partir
// de l'id_token de la session courante.
//
// Contexte : signOut() de next-auth ne fait que supprimer le cookie de
// session NextAuth — la session SSO côté Keycloak (son propre cookie
// KEYCLOAK_SESSION sur le domaine du realm) reste active. Conséquence
// observée en testant le bouton "Déconnexion" : après clic, l'utilisateur
// est bien renvoyé sur /login, mais un simple clic sur "Se connecter"
// (sans ressaisir aucun identifiant) le reconnecte silencieusement au même
// compte via le SSO Keycloak — la "déconnexion" n'en est donc pas vraiment
// une sur un poste partagé. Cette route retourne l'URL à laquelle rediriger
// le navigateur (en plus de l'appel signOut() habituel) pour terminer
// aussi la session Keycloak elle-même. Voir l'appel dans ChatSidebar.tsx.
//
// id_token_hint identifie la session Keycloak à terminer sans écran de
// confirmation ; client_id + post_logout_redirect_uri (autorisée par
// "post.logout.redirect.uris": "+" sur le client educi-frontend, voir
// keycloak/realm-export.json) ramènent ensuite le navigateur sur /login.
const KEYCLOAK_ISSUER = process.env.KEYCLOAK_ISSUER!;

export async function GET(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  const idToken = token?.idToken as string | undefined;

  const postLogoutRedirectUri = `${process.env.NEXTAUTH_URL}/login`;
  const params = new URLSearchParams({
    client_id: process.env.KEYCLOAK_CLIENT_ID!,
    post_logout_redirect_uri: postLogoutRedirectUri,
  });
  if (idToken) {
    params.set("id_token_hint", idToken);
  }

  const logoutUrl = `${KEYCLOAK_ISSUER}/protocol/openid-connect/logout?${params.toString()}`;
  return NextResponse.json({ logoutUrl });
}
