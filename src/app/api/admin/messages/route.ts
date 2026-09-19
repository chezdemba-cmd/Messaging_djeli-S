import { NextRequest, NextResponse } from "next/server";
import { inMemoryDb } from "@/lib/db";
import { getServiceSupabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const statusFilter = searchParams.get("status");
  const typeFilter = searchParams.get("type");
  const appFilter = searchParams.get("app");

  const supabase = getServiceSupabase();

  if (supabase) {
    let query = supabase
      .from("messages")
      .select("*, applications(name, slug)")
      .order("created_at", { ascending: false })
      .limit(100);

    if (statusFilter && statusFilter !== "all") {
      query = query.eq("status", statusFilter);
    }
    if (typeFilter && typeFilter !== "all") {
      query = query.eq("sms_type", typeFilter);
    }
    if (appFilter && appFilter !== "all") {
      query = query.eq("application_id", appFilter);
    }

    const { data } = await query;
    return NextResponse.json({ messages: data || [] });
  }

  let list = Array.from(inMemoryDb.messages.values());

  if (statusFilter && statusFilter !== "all") {
    list = list.filter((m) => m.status === statusFilter);
  }
  if (typeFilter && typeFilter !== "all") {
    list = list.filter((m) => m.smsType === typeFilter);
  }
  if (appFilter && appFilter !== "all") {
    list = list.filter((m) => m.applicationId === appFilter);
  }

  // Formatage avec les noms d'applications
  const enriched = list.map((m) => {
    const app = inMemoryDb.applications.get(m.applicationId);
    return {
      ...m,
      applications: {
        name: app?.name || "Inconnue",
        slug: app?.slug || "inconnue",
      },
    };
  });

  return NextResponse.json({ messages: enriched });
}
