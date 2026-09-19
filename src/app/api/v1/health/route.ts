import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { InfobipProvider } from "@/providers/infobip.provider";
import { ProviderFactory } from "@/providers/provider.factory";

export async function GET() {
  const infobip = new InfobipProvider();
  const factory = ProviderFactory.getInstance();
  const registeredProviders = factory.getAllProviders().map((p) => ({
    name: p.name,
    configured: p.isConfigured(),
  }));

  const supabase = getServiceSupabase();
  let dbStatus = "in-memory (mock/local mode)";

  if (supabase) {
    try {
      const { error } = await supabase.from("providers").select("id").limit(1);
      dbStatus = error ? `error: ${error.message}` : "connected";
    } catch (e: unknown) {
      dbStatus = `unreachable: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  // Heure locale Africa/Bamako
  const bamakoTime = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Africa/Bamako",
    dateStyle: "full",
    timeStyle: "long",
  }).format(new Date());

  return NextResponse.json({
    status: "healthy",
    service: "Djeli'S Messaging API",
    version: "1.0.0",
    timezone: "Africa/Bamako",
    localTime: bamakoTime,
    database: dbStatus,
    providers: registeredProviders,
    infobipConfigured: infobip.isConfigured(),
  });
}
