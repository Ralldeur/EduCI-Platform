import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";

// Relaie l'upload vers gateway/api/ml/lessons/ingest (-> ml-service
// POST /lessons/ingest, voir ml-service/app/main.py). Le body multipart
// (fichier + champs) est transmis tel quel : pas de parsing/reconstruction
// nécessaire, `fetch` accepte un FormData directement comme body et gère
// lui-même l'en-tête Content-Type (boundary compris).
const GATEWAY_URL = process.env.GATEWAY_URL || "http://gateway:8000";

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if ("error" in admin) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }

  const formData = await req.formData();

  const res = await fetch(`${GATEWAY_URL}/api/ml/lessons/ingest`, {
    method: "POST",
    headers: { Authorization: `Bearer ${admin.accessToken}` },
    body: formData,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return NextResponse.json({ error: data.detail ?? "Erreur lors de l'ingestion du document" }, { status: res.status });
  }

  return NextResponse.json(data, { status: 201 });
}
