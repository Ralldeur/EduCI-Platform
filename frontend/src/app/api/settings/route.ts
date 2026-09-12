import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth";

// Permet à l'élève de modifier lui-même son prénom affiché, via l'API
// Account de Keycloak (GET/POST /realms/{realm}/account), authentifiée avec
// son PROPRE access_token — pas besoin de droits admin, contrairement à
// keycloakAdmin.ts (compte de service, réservé aux routes /api/admin/*).
// Seul le prénom est modifiable ici : "editUsernameAllowed": false dans
// keycloak/realm-export.json bloque déjà tout changement de username côté
// Keycloak lui-même, donc on ne l'expose même pas dans le body accepté.
//
// Prérequis découvert en investiguant cette fonctionnalité (voir
// keycloak/README.md) : l'API Account exige que l'utilisateur porte les
// rôles client "view-profile"/"manage-account" du client interne "account",
// normalement inclus automatiquement via le rôle composite
// "default-roles-<realm>" attribué à la création d'un compte. Un élève
// inscrit normalement (registrationAllowed: true) l'a par défaut et n'a
// besoin d'aucune configuration supplémentaire. Les comptes de démo
// (admin.demo, eleve.demo), eux, sont créés en bloc via l'import JSON du
// realm plutôt que via ce flux normal et n'avaient PAS ce rôle — corrigé
// dans realm-export.json (voir le commentaire sur ces utilisateurs).
//
// On passe par KEYCLOAK_INTERNAL_ISSUER (réseau docker interne) plutôt que
// KEYCLOAK_ISSUER (URL publique) pour cet appel serveur-à-serveur — même
// distinction que dans src/lib/auth.ts (voir son en-tête pour le contexte
// du hairpin NAT en prod).
const KEYCLOAK_INTERNAL_ISSUER =
  process.env.KEYCLOAK_INTERNAL_ISSUER || process.env.KEYCLOAK_ISSUER!;

interface KeycloakAccount {
  username: string;
  email: string;
  firstName?: string;
  lastName?: string;
}

const MAX_FIRST_NAME_LENGTH = 255; // même borne que le validateur Keycloak (attribut firstName).

export async function POST(req: NextRequest) {
  const accessToken = await getAccessToken(req);
  if (!accessToken) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const firstName = typeof body.firstName === "string" ? body.firstName.trim() : "";
  if (!firstName) {
    return NextResponse.json({ error: "Le prénom ne peut pas être vide" }, { status: 400 });
  }
  if (firstName.length > MAX_FIRST_NAME_LENGTH) {
    return NextResponse.json(
      { error: `Le prénom ne peut pas dépasser ${MAX_FIRST_NAME_LENGTH} caractères` },
      { status: 400 }
    );
  }

  const accountUrl = `${KEYCLOAK_INTERNAL_ISSUER}/account`;
  const authHeaders = { Authorization: `Bearer ${accessToken}`, Accept: "application/json" };

  // L'API Account remplace l'intégralité du profil envoyé (pas de PATCH
  // partiel) : on relit d'abord username/email/lastName pour ne changer QUE
  // firstName, sinon ces champs repartiraient vides.
  const currentRes = await fetch(accountUrl, { headers: authHeaders });
  if (!currentRes.ok) {
    console.error("[settings] échec de lecture du profil Keycloak:", currentRes.status);
    return NextResponse.json({ error: "Impossible de charger le profil" }, { status: 502 });
  }
  const current: KeycloakAccount = await currentRes.json();

  const updateRes = await fetch(accountUrl, {
    method: "POST",
    headers: { ...authHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({
      username: current.username,
      email: current.email,
      lastName: current.lastName,
      firstName,
    }),
  });

  if (!updateRes.ok) {
    console.error("[settings] échec de mise à jour du profil Keycloak:", updateRes.status);
    return NextResponse.json({ error: "Impossible d'enregistrer le prénom" }, { status: 502 });
  }

  return NextResponse.json({ firstName });
}
