import { redirect } from "next/navigation";

// Ancienne version (décision du 23/08) : auto-inscription désactivée, page
// statique "contacte ton établissement" sans aucun formulaire — obsolète
// depuis l'activation de l'auto-inscription côté Keycloak
// (registrationAllowed: true, voir keycloak/realm-export.json), qui
// fonctionne déjà (vérifié manuellement : formulaire d'inscription Keycloak
// natif, e-mail de vérification Brevo). Cette page bloquait totalement
// l'inscription pour quiconque l'atteignait (lien direct, favori, etc.),
// sans jamais rediriger vers le flux Keycloak réel — bug trouvé le
// 2026-09-14 via une vidéo d'un testeur externe.
//
// On redirige donc directement vers l'écran d'inscription natif de
// Keycloak plutôt que de dupliquer un formulaire dans le frontend : mêmes
// paramètres que l'URL d'autorisation construite par next-auth/providers/
// keycloak (voir src/lib/auth.ts), mais sur l'endpoint `/registrations` au
// lieu de `/auth` — c'est exactement le lien "Nouvel utilisateur ?
// Enregistrement" affiché nativement par Keycloak sur /login. Après
// inscription + vérification d'e-mail, Keycloak referme le flux OAuth vers
// ce même redirect_uri, identique à une connexion normale.
export default function RegisterPage() {
  const issuer = process.env.KEYCLOAK_ISSUER!;
  const clientId = process.env.KEYCLOAK_CLIENT_ID!;
  const redirectUri = `${process.env.NEXTAUTH_URL}/api/auth/callback/keycloak`;

  const registrationUrl =
    `${issuer}/protocol/openid-connect/registrations` +
    `?client_id=${encodeURIComponent(clientId)}` +
    `&response_type=code` +
    `&scope=openid` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}`;

  redirect(registrationUrl);
}
