import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { keycloakAdminFetch } from "@/lib/keycloakAdmin";

// Suppression DÉFINITIVE du compte Keycloak (pas une simple désactivation
// d'accès — l'utilisateur et son profil disparaissent du realm). Ses
// conversations/messages en base applicative (Postgres, hors Keycloak) ne
// sont volontairement pas touchés ici : ce endpoint ne gère que l'identité,
// pas les données métier, pour rester simple et éviter une suppression en
// cascade accidentelle plus large que ce qui est demandé.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const admin = await requireAdmin(req);
  if ("error" in admin) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }

  const { userId } = await params;

  const res = await keycloakAdminFetch(`/users/${userId}`, { method: "DELETE" });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(
      { error: data.errorMessage ?? "Erreur lors de la suppression de l'utilisateur" },
      { status: res.status }
    );
  }

  return new NextResponse(null, { status: 204 });
}
