import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { keycloakAdminFetch } from "@/lib/keycloakAdmin";

const GATEWAY_URL = process.env.GATEWAY_URL || "http://gateway:8000";

interface DashboardStats {
  totalUsers: number;
  totalConversations: number;
  totalMessages: number;
  totalDocuments: number;
}

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if ("error" in admin) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }

  const authHeaders = { Authorization: `Bearer ${admin.accessToken}` };

  const [usersCountRes, chatStatsRes, mlStatsRes] = await Promise.all([
    keycloakAdminFetch("/users/count"),
    fetch(`${GATEWAY_URL}/api/chat/admin/stats`, { headers: authHeaders }),
    fetch(`${GATEWAY_URL}/api/ml/admin/stats`, { headers: authHeaders }),
  ]);

  if (!usersCountRes.ok || !chatStatsRes.ok || !mlStatsRes.ok) {
    return NextResponse.json({ error: "Erreur lors du chargement des statistiques" }, { status: 502 });
  }

  const totalUsers: number = await usersCountRes.json();
  const chatStats: { totalConversations: number; totalMessages: number } = await chatStatsRes.json();
  const mlStats: { totalDocuments: number } = await mlStatsRes.json();

  const stats: DashboardStats = {
    totalUsers,
    totalConversations: chatStats.totalConversations,
    totalMessages: chatStats.totalMessages,
    totalDocuments: mlStats.totalDocuments,
  };

  return NextResponse.json(stats);
}
