import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";

// Relaie vers gateway/api/ml/lessons/{documentId}/status (-> ml-service GET
// /lessons/{document_id}/status, voir ml-service/app/main.py) — utilisé par
// /admin/lessons pour faire du polling pendant l'ingestion en tâche de fond
// d'un gros document (œuvre complète).
const GATEWAY_URL = process.env.GATEWAY_URL || "http://gateway:8000";

export async function GET(req: NextRequest, { params }: { params: Promise<{ documentId: string }> }) {
  const admin = await requireAdmin(req);
  if ("error" in admin) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }

  const { documentId } = await params;

  const res = await fetch(`${GATEWAY_URL}/api/ml/lessons/${encodeURIComponent(documentId)}/status`, {
    headers: { Authorization: `Bearer ${admin.accessToken}` },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return NextResponse.json({ error: data.detail ?? "Statut d'ingestion introuvable" }, { status: res.status });
  }

  return NextResponse.json(data);
}
