import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";

// Relaie la suppression vers ml-service (voir ml-service/app/main.py) :
// - un documentId "normal" (introduit le 2026-09-20) -> DELETE
//   /api/ml/lessons/by-document-id/{documentId}
// - un id "legacy:<source>" (points ingérés AVANT documentId, regroupés par
//   nom de fichier par RagPipeline.list_documents) -> on retire le préfixe
//   et on retombe sur l'ancienne route DELETE
//   /api/ml/lessons/by-source/{source}, seule capable de les retrouver.
// Le paramètre de route s'appelle encore "source" pour ne pas renommer le
// dossier `[source]`, mais porte en réalité l'un ou l'autre de ces deux ids
// (voir doc.documentId dans /admin/lessons/page.tsx).
const GATEWAY_URL = process.env.GATEWAY_URL || "http://gateway:8000";
const LEGACY_PREFIX = "legacy:";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ source: string }> }) {
  const admin = await requireAdmin(req);
  if ("error" in admin) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }

  const { source: id } = await params;

  const gatewayPath = id.startsWith(LEGACY_PREFIX)
    ? `/api/ml/lessons/by-source/${encodeURIComponent(id.slice(LEGACY_PREFIX.length))}`
    : `/api/ml/lessons/by-document-id/${encodeURIComponent(id)}`;

  const res = await fetch(`${GATEWAY_URL}${gatewayPath}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${admin.accessToken}` },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return NextResponse.json({ error: data.detail ?? "Erreur lors de la suppression du document" }, { status: res.status });
  }

  return NextResponse.json(data);
}
