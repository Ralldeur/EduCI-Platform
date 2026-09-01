import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";

// Relaie la suppression vers gateway/api/ml/lessons/by-source/:source
// (-> ml-service DELETE /lessons/by-source/{source}, voir
// ml-service/app/main.py). `source` est le nom de fichier tel qu'ingéré
// (route.ts d'ingestion l'a stocké tel quel dans le payload Qdrant), donc on
// le ré-encode ici pour l'URL du gateway — le segment dynamique Next.js
// arrive déjà décodé.
const GATEWAY_URL = process.env.GATEWAY_URL || "http://gateway:8000";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ source: string }> }) {
  const admin = await requireAdmin(req);
  if ("error" in admin) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }

  const { source } = await params;

  const res = await fetch(`${GATEWAY_URL}/api/ml/lessons/by-source/${encodeURIComponent(source)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${admin.accessToken}` },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return NextResponse.json({ error: data.detail ?? "Erreur lors de la suppression du document" }, { status: res.status });
  }

  return NextResponse.json(data);
}
