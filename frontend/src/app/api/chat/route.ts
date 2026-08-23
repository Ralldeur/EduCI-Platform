import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth";

const GATEWAY_URL = process.env.GATEWAY_URL || "http://gateway:8000";

// Relaye le flux SSE de chat-service (via le gateway) directement vers le
// navigateur, sans le bufferiser entièrement côté serveur Next.js — sinon
// l'effet de streaming (texte qui apparaît au fur et à mesure) serait perdu
// et l'élève attendrait la réponse complète avant de rien voir.
export async function POST(req: NextRequest) {
  const accessToken = await getAccessToken(req);
  if (!accessToken) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));

  const gatewayRes = await fetch(`${GATEWAY_URL}/api/chat/chat`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!gatewayRes.ok || !gatewayRes.body) {
    const errorBody = await gatewayRes.json().catch(() => ({ error: "IA indisponible pour le moment" }));
    return NextResponse.json(errorBody, { status: gatewayRes.status || 502 });
  }

  // Passthrough direct du ReadableStream — Next.js (App Router) accepte un
  // stream comme corps de réponse.
  return new NextResponse(gatewayRes.body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
