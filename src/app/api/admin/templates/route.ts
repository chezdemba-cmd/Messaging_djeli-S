import { NextRequest, NextResponse } from "next/server";
import { inMemoryDb } from "@/lib/db";
import { getServiceSupabase } from "@/lib/supabase";
import { extractTemplateVariables } from "@/lib/templates";

export async function GET() {
  const supabase = getServiceSupabase();

  if (supabase) {
    const { data: templates } = await supabase
      .from("templates")
      .select("*, applications(name, slug)")
      .order("created_at", { ascending: false });

    return NextResponse.json({ templates: templates || [] });
  }

  const templates = Array.from(inMemoryDb.templates.values());
  return NextResponse.json({ templates });
}

export async function POST(request: NextRequest) {
  let body: { name?: string; slug?: string; content?: string; smsType?: string; senderId?: string; applicationId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
  }

  if (!body.name || !body.slug || !body.content) {
    return NextResponse.json({ error: "name, slug et content sont obligatoires" }, { status: 400 });
  }

  // Extraction automatique des variables {{variable}} du contenu
  const detectedVariables = extractTemplateVariables(body.content);

  const supabase = getServiceSupabase();
  if (supabase) {
    const { data, error } = await supabase
      .from("templates")
      .insert({
        application_id: body.applicationId || null,
        name: body.name,
        slug: body.slug.toLowerCase(),
        content: body.content,
        sms_type: body.smsType || "transactional",
        senderId: body.senderId || "DJELIS",
        variables: detectedVariables,
        active: true,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, template: data }, { status: 201 });
  }

  const newTplId = `tpl-${Date.now()}`;
  const newTpl = {
    id: newTplId,
    applicationId: body.applicationId || null,
    name: body.name,
    slug: body.slug.toLowerCase(),
    content: body.content,
    smsType: (body.smsType as "otp" | "transactional" | "marketing") || "transactional",
    senderId: body.senderId || "DJELIS",
    variables: detectedVariables,
    active: true,
  };
  inMemoryDb.templates.set(body.slug.toLowerCase(), newTpl);

  return NextResponse.json({ success: true, template: newTpl }, { status: 201 });
}
