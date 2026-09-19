import { NextRequest, NextResponse } from "next/server";
import { inMemoryDb } from "@/lib/db";
import { getServiceSupabase } from "@/lib/supabase";
import { generateApiKey } from "@/lib/security";

export async function GET() {
  const supabase = getServiceSupabase();

  if (supabase) {
    const { data: apps } = await supabase
      .from("applications")
      .select("*, api_keys(id, key_prefix, created_at, revoked_at, last_used_at)")
      .order("created_at", { ascending: false });

    return NextResponse.json({ applications: apps || [] });
  }

  const apps = Array.from(inMemoryDb.applications.values()).map((app) => {
    const keys = Array.from(inMemoryDb.apiKeys.values())
      .filter((k) => k.applicationId === app.id)
      .map((k) => ({
        id: k.id,
        key_prefix: k.keyPrefix,
        created_at: new Date().toISOString(),
        revoked_at: k.revokedAt,
      }));

    return {
      ...app,
      api_keys: keys,
    };
  });

  return NextResponse.json({ applications: apps });
}

export async function POST(request: NextRequest) {
  let body: { action?: string; applicationId?: string; name?: string; slug?: string; dailyLimit?: number; monthlyLimit?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
  }

  const supabase = getServiceSupabase();

  // Action: Générer une nouvelle clé API
  if (body.action === "generate_key") {
    if (!body.applicationId) {
      return NextResponse.json({ error: "applicationId requis" }, { status: 400 });
    }

    const { rawKey, prefix, hash } = generateApiKey();

    if (supabase) {
      const { data: keyRecord, error } = await supabase
        .from("api_keys")
        .insert({
          application_id: body.applicationId,
          key_prefix: prefix,
          key_hash: hash,
        })
        .select()
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      // La clé complète (rawKey) n'est renvoyée qu'une seule et unique fois
      return NextResponse.json({
        success: true,
        keyId: keyRecord.id,
        prefix,
        rawKey,
        warning: "Copiez cette clé maintenant. Elle ne sera plus jamais affichée.",
      });
    }

    // Fallback mémoire
    const keyId = `key-${Date.now()}`;
    inMemoryDb.apiKeys.set(keyId, {
      id: keyId,
      applicationId: body.applicationId,
      keyPrefix: prefix,
      keyHash: hash,
      revokedAt: null,
      expiresAt: null,
    });

    return NextResponse.json({
      success: true,
      keyId,
      prefix,
      rawKey,
      warning: "Copiez cette clé maintenant. Elle ne sera plus jamais affichée.",
    });
  }

  // Action: Créer une nouvelle application
  if (!body.name || !body.slug) {
    return NextResponse.json({ error: "name et slug sont requis" }, { status: 400 });
  }

  if (supabase) {
    const { data: app, error } = await supabase
      .from("applications")
      .insert({
        name: body.name,
        slug: body.slug.toLowerCase(),
        daily_limit: body.dailyLimit || 10000,
        monthly_limit: body.monthlyLimit || 250000,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, application: app }, { status: 201 });
  }

  // Fallback mémoire
  const newAppId = `app-${Date.now()}`;
  const newApp = {
    id: newAppId,
    name: body.name,
    slug: body.slug.toLowerCase(),
    status: "active" as const,
    dailyLimit: body.dailyLimit || 10000,
    monthlyLimit: body.monthlyLimit || 250000,
  };
  inMemoryDb.applications.set(newAppId, newApp);

  return NextResponse.json({ success: true, application: newApp }, { status: 201 });
}
