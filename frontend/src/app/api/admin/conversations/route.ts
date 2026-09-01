import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";

// Relaie vers gateway/api/chat/admin/conversations (-> chat-service GET
// /admin/conversations, voir chat-service/src/index.js). Double vérification
// ROLE_ADMIN : ici via requireAdmin (session NextAuth) et côté chat-service
// via le header x-user-roles injecté par le gateway à partir du JWT — la
// route chat-service ne fait pas confiance à ce frontend seul, voir le
// commentaire au-dessus de isAdmin() dans chat-service.
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
  const admin = await requireAdmin(req);
  if ("error" in admin) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }

  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "userId requis" }, { status: 400 });
  }

  const res = await fetch(
    `${GATEWAY_URL}/api/chat/admin/conversations?userId=${encodeURIComponent(userId)}`,
    { headers: { Authorization: `Bearer ${admin.accessToken}` } }
  );

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(
      { error: data.error ?? "Erreur lors du chargement des conversations" },
      { status: res.status }
    );
  }

  const rows: ConversationRow[] = await res.json();
  return NextResponse.json(rows.map(toConversationSummary));
}
