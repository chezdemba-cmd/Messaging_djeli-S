import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey, inMemoryDb } from "@/lib/db";
import { getServiceSupabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return NextResponse.json(
      { success: false, errorCode: "UNAUTHORIZED", errorMessage: "Clé API requise" },
      { status: 401 }
    );
  }

  const apiKey = authHeader.replace("Bearer ", "").trim();
  const app = await authenticateApiKey(apiKey);

  if (!app) {
    return NextResponse.json(
      { success: false, errorCode: "INVALID_API_KEY", errorMessage: "Clé API invalide" },
      { status: 401 }
    );
  }

  const supabase = getServiceSupabase();

  if (supabase) {
    // Calcul de l'usage du jour
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { count: dailySent } = await supabase
      .from("messages")
      .select("*", { count: "exact", head: true })
      .eq("application_id", app.id)
      .gte("created_at", today.toISOString());

    // Calcul de l'usage du mois
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const { count: monthlySent } = await supabase
      .from("messages")
      .select("*", { count: "exact", head: true })
      .eq("application_id", app.id)
      .gte("created_at", startOfMonth.toISOString());

    return NextResponse.json({
      success: true,
      application: {
        id: app.id,
        name: app.name,
        slug: app.slug,
      },
      quotas: {
        daily: {
          limit: app.dailyLimit,
          used: dailySent || 0,
          remaining: Math.max(0, app.dailyLimit - (dailySent || 0)),
        },
        monthly: {
          limit: app.monthlyLimit,
          used: monthlySent || 0,
          remaining: Math.max(0, app.monthlyLimit - (monthlySent || 0)),
        },
      },
      currency: "FCFA",
    });
  }

  // Fallback mémoire
  const allAppMsgs = Array.from(inMemoryDb.messages.values()).filter(
    (m) => m.applicationId === app.id
  );

  return NextResponse.json({
    success: true,
    application: {
      id: app.id,
      name: app.name,
      slug: app.slug,
    },
    quotas: {
      daily: {
        limit: app.dailyLimit,
        used: allAppMsgs.length,
        remaining: Math.max(0, app.dailyLimit - allAppMsgs.length),
      },
      monthly: {
        limit: app.monthlyLimit,
        used: allAppMsgs.length,
        remaining: Math.max(0, app.monthlyLimit - allAppMsgs.length),
      },
    },
    currency: "FCFA",
  });
}
