import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth";

const GATEWAY_URL = process.env.GATEWAY_URL || "http://gateway:8000";

/** Forme d'une ligne "message" telle que renvoyée par chat-service (snake_case). */
interface MessageRow {
  id: string;
  content: string;
  role: string;
  created_at: string;
}

/** Forme d'une conversation détaillée (avec messages) renvoyée par chat-service. */
interface ConversationDetailRow {
  id: string;
  title: string | null;
  subject: string | null;
  grade_level: string | null;
  serie: string | null;
  mode: string;
  created_at: string;
  updated_at: string;
  messages?: MessageRow[];
  hasMore?: boolean;
  totalMessages?: number;
}

function toMessage(row: MessageRow) {
  return {
    id: row.id,
    content: row.content,
    role: row.role,
    createdAt: row.created_at,
  };
}

function toConversation(row: ConversationDetailRow) {
  return {
    id: row.id,
    title: row.title,
    subject: row.subject,
    gradeLevel: row.grade_level,
    serie: row.serie,
    mode: row.mode,
    messages: (row.messages ?? []).map(toMessage),
    hasMore: row.hasMore ?? false,
    totalMessages: row.totalMessages ?? (row.messages ?? []).length,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const accessToken = await getAccessToken(req);
  if (!accessToken) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  // `before` : ISO timestamp du message le plus ancien déjà chargé côté
  // client, pour remonter dans l'historique (voir chat-service::fetchMessagesPage).
  const before = req.nextUrl.searchParams.get("before");
  const url = new URL(`${GATEWAY_URL}/api/chat/conversations/${id}`);
  if (before) url.searchParams.set("before", before);

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    return NextResponse.json({ error: "Conversation introuvable" }, { status: res.status });
  }

  const row: ConversationDetailRow = await res.json();
  return NextResponse.json(toConversation(row));
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const accessToken = await getAccessToken(req);
  if (!accessToken) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));

  const res = await fetch(`${GATEWAY_URL}/api/chat/conversations/${id}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    return NextResponse.json({ error: "Erreur lors de la mise à jour" }, { status: res.status });
  }

  const row: ConversationDetailRow = await res.json();
  return NextResponse.json(toConversation({ ...row, messages: [] }));
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const accessToken = await getAccessToken(req);
  if (!accessToken) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const res = await fetch(`${GATEWAY_URL}/api/chat/conversations/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    return NextResponse.json({ error: "Conversation introuvable" }, { status: res.status });
  }

  return new NextResponse(null, { status: 204 });
}
