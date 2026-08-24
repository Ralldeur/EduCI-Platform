import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth";

const GATEWAY_URL = process.env.GATEWAY_URL || "http://gateway:8000";

export async function POST(req: NextRequest) {
  const accessToken = await getAccessToken(req);
  if (!accessToken) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));

  const res = await fetch(`${GATEWAY_URL}/api/chat/exercises/correct`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({ error: "Réponse invalide" }));
  return NextResponse.json(data, { status: res.status });
}
