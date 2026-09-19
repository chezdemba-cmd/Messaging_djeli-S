import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { inMemoryDb } from "@/lib/db";

export async function POST(request: NextRequest) {
  // Protection de l'endpoint interne : vérification du secret de travail
  const secret = request.headers.get("x-worker-secret") || request.headers.get("authorization");
  const expectedSecret = process.env.INTERNAL_WORKER_SECRET;

  if (expectedSecret && secret !== expectedSecret && secret !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ error: "Accès refusé au worker interne" }, { status: 403 });
  }

  let body: { messageId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON requis" }, { status: 400 });
  }

  if (!body.messageId) {
    return NextResponse.json({ error: "messageId requis" }, { status: 400 });
  }

  const supabase = getServiceSupabase();
  if (supabase) {
    const { data: msg } = await supabase
      .from("messages")
      .select("*")
      .eq("id", body.messageId)
      .maybeSingle();

    if (!msg) {
      return NextResponse.json({ error: "Message introuvable" }, { status: 404 });
    }

    return NextResponse.json({ success: true, processed: true, messageId: body.messageId });
  }

  const memMsg = inMemoryDb.messages.get(body.messageId);
  if (!memMsg) {
    return NextResponse.json({ error: "Message introuvable" }, { status: 404 });
  }

  return NextResponse.json({ success: true, processed: true, messageId: body.messageId });
}
