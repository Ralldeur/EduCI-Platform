import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { keycloakAdminFetch } from "@/lib/keycloakAdmin";

/** Sous-ensemble de UserRepresentation (API Admin Keycloak) qui nous intéresse. */
interface KeycloakUser {
  id: string;
  username: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  createdTimestamp?: number;
  attributes?: { grade_level?: string[]; bac_series?: string[] };
}

interface KeycloakRole {
  name: string;
}

function toName(user: KeycloakUser): string | null {
  const parts = [user.firstName, user.lastName].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : null;
}

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if ("error" in admin) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }

  const usersRes = await keycloakAdminFetch("/users");
  if (!usersRes.ok) {
    return NextResponse.json({ error: "Erreur lors du chargement des utilisateurs" }, { status: 502 });
  }
  const users: KeycloakUser[] = await usersRes.json();

  // L'API Admin Keycloak ne renvoie pas les rôles réalm dans la liste des
  // utilisateurs — un appel séparé par utilisateur est nécessaire.
  const roleLists = await Promise.all(
    users.map(async (user) => {
      const rolesRes = await keycloakAdminFetch(`/users/${user.id}/role-mappings/realm`);
      if (!rolesRes.ok) return [] as string[];
      const roles: KeycloakRole[] = await rolesRes.json();
      return roles.map((r) => r.name);
    })
  );

  const result = users.map((user, i) => ({
    id: user.id,
    username: user.username,
    name: toName(user),
    email: user.email ?? null,
    roles: roleLists[i],
    gradeLevel: user.attributes?.grade_level?.[0] ?? null,
    bacSeries: user.attributes?.bac_series?.[0] ?? null,
    // Absent pour les utilisateurs importés statiquement via
    // keycloak/realm-export.json (admin.demo, eleve.demo) — Keycloak ne
    // renseigne createdTimestamp que pour les comptes créés via un flux
    // normal (inscription, Admin API).
    createdAt: user.createdTimestamp ? new Date(user.createdTimestamp).toISOString() : null,
  }));

  return NextResponse.json(result);
}
