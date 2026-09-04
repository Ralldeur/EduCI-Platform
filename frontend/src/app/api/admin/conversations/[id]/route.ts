import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";

// Relaie vers gateway/api/chat/admin/conversations/:id (-> chat-service GET
// /admin/conversations/:id). Lecture seule volontairement : pas de
// PATCH/DELETE ici, contrairement à /api/conversations/[id] qui gère ses
// propres conversations — voir consigne produit (un admin ne modifie/
// supprime jamais les conversations d'un autre utilisateur depuis cet écran).
const GATEWAY_URL = process.env.GATEWAY_URL || "http://gateway:8000";

interface MessageRow {
  id: string;
  content: string;
  role: string;
  created_at: string;
}

interface ConversationDetailRow {
  id: string;
  user_id: string;
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
    userId: row.user_id,
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
  const admin = await requireAdmin(req);
  if ("error" in admin) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }

  const { id } = await params;

  // `before` : ISO timestamp du message le plus ancien déjà chargé côté
  // client, pour remonter dans l'historique (voir chat-service::fetchMessagesPage).
  const before = req.nextUrl.searchParams.get("before");
  const url = new URL(`${GATEWAY_URL}/api/chat/admin/conversations/${id}`);
  if (before) url.searchParams.set("before", before);

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${admin.accessToken}` },
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(
      { error: data.error ?? "Conversation introuvable" },
      { status: res.status }
    );
  }

  const row: ConversationDetailRow = await res.json();
  return NextResponse.json(toConversation(row));
}
