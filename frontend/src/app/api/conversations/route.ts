import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth";

// Proxy server-side vers gateway/api/chat/conversations, avec transformation
// des noms de champs snake_case (Postgres, via chat-service) vers camelCase
// (attendu par le frontend — voir src/types/index.ts). L'appel au gateway se
// fait depuis le conteneur Next.js, d'où GATEWAY_URL="http://gateway:8000"
// (nom de service Docker), différent de NEXT_PUBLIC_GATEWAY_URL utilisé côté
// navigateur ailleurs dans l'app.
const GATEWAY_URL = process.env.GATEWAY_URL || "http://gateway:8000";

/** Forme d'une ligne "conversation" telle que renvoyée par chat-service (snake_case, colonnes Postgres). */
interface ConversationRow {
  id: string;
  title: string | null;
  subject: string | null;
  grade_level: string | null;
  serie: string | null;
  mode: string;
  created_at: string;
  updated_at: string;
  message_count?: number;
}

function toConversationSummary(row: ConversationRow) {
  return {
    id: row.id,
    title: row.title,
    subject: row.subject,
    gradeLevel: row.grade_level,
    mode: row.mode,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    _count: { messages: row.message_count ?? 0 },
  };
}

export async function GET(req: NextRequest) {
  const accessToken = await getAccessToken(req);
  if (!accessToken) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const res = await fetch(`${GATEWAY_URL}/api/chat/conversations`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    return NextResponse.json({ error: "Erreur lors du chargement des conversations" }, { status: res.status });
  }

  const rows: ConversationRow[] = await res.json();
  return NextResponse.json(rows.map(toConversationSummary));
}

export async function POST(req: NextRequest) {
  const accessToken = await getAccessToken(req);
  if (!accessToken) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));

  const res = await fetch(`${GATEWAY_URL}/api/chat/conversations`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    // Les clés camelCase du body (subject, gradeLevel, serie, mode) sont déjà
    // celles attendues par chat-service (POST /conversations) — pas de
    // transformation nécessaire ici, seulement en lecture (GET).
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    return NextResponse.json({ error: "Erreur lors de la création de la conversation" }, { status: res.status });
  }

  const row: ConversationRow = await res.json();
  return NextResponse.json(
    {
      id: row.id,
      title: row.title,
      subject: row.subject,
      gradeLevel: row.grade_level,
      serie: row.serie,
      mode: row.mode,
      messages: [],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
    { status: 201 }
  );
}
