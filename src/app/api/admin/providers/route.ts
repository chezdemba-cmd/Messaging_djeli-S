import { NextRequest, NextResponse } from "next/server";
import { InfobipProvider } from "@/providers/infobip.provider";
import { getServiceSupabase } from "@/lib/supabase";

export async function GET() {
  const infobip = new InfobipProvider();
  const supabase = getServiceSupabase();

  if (supabase) {
    const { data: providers } = await supabase
      .from("providers")
      .select("*")
      .order("priority", { ascending: true });

    return NextResponse.json({ providers: providers || [] });
  }

  // Fallback mémoire
  const providers = [
    {
      id: "a0000000-0000-0000-0000-000000000001",
      code: "infobip",
      name: "Infobip SMS",
      enabled: true,
      priority: 10,
      health_status: infobip.isConfigured() ? "healthy" : "degraded",
      configuration_metadata: {
        configured: infobip.isConfigured(),
        description: "Connecteur Infobip réel HTTP REST",
      },
    },
    {
      id: "a0000000-0000-0000-0000-000000000002",
      code: "mock",
      name: "Simulateur / Mock Provider",
      enabled: true,
      priority: 999,
      health_status: "healthy",
      configuration_metadata: {
        configured: true,
        description: "Fournisseur simulé pour le développement et les tests",
      },
    },
    {
      id: "a0000000-0000-0000-0000-000000000003",
      code: "orange_mali",
      name: "Orange Mali SMS API",
      enabled: false,
      priority: 20,
      health_status: "maintenance",
      configuration_metadata: {
        configured: false,
        description: "Squelette inactif en attente des identifiants et documentation contractuelle",
      },
    },
  ];

  return NextResponse.json({ providers });
}

export async function POST(request: NextRequest) {
  let body: { action?: string; providerCode?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
  }

  if (body.action === "test_connection" && body.providerCode === "infobip") {
    const infobip = new InfobipProvider();
    const result = await infobip.testConfiguration();
    return NextResponse.json(result);
  }

  return NextResponse.json({ error: "Action inconnue" }, { status: 400 });
}
