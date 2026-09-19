import { NextResponse } from "next/server";
import { inMemoryDb } from "@/lib/db";
import { getServiceSupabase } from "@/lib/supabase";

export async function GET() {
  const supabase = getServiceSupabase();

  if (supabase) {
    const { data: messages } = await supabase
      .from("messages")
      .select("id, status, sms_type, provider_id, segment_count, estimated_cost_fcfa, actual_cost_fcfa, application_id, applications(name, slug), providers(name, code)");

    const list = messages || [];
    const totalCount = list.length;
    const deliveredCount = list.filter((m) => m.status === "delivered" || m.status === "accepted" || m.status === "sent").length;
    const failedCount = list.filter((m) => m.status === "failed").length;
    const totalCost = list.reduce((acc, m) => acc + (Number(m.actual_cost_fcfa || m.estimated_cost_fcfa) || 0), 0);

    const appBreakdown: Record<string, { name: string; count: number; costFcfa: number }> = {};
    for (const m of list) {
      const appName = (m.applications as unknown as { name?: string })?.name || "Autre";
      if (!appBreakdown[appName]) {
        appBreakdown[appName] = { name: appName, count: 0, costFcfa: 0 };
      }
      appBreakdown[appName].count += 1;
      appBreakdown[appName].costFcfa += Number(m.actual_cost_fcfa || m.estimated_cost_fcfa) || 0;
    }

    return NextResponse.json({
      totalMessages: totalCount,
      deliveredMessages: deliveredCount,
      failedMessages: failedCount,
      deliveryRate: totalCount > 0 ? ((deliveredCount / totalCount) * 100).toFixed(1) : "100.0",
      failureRate: totalCount > 0 ? ((failedCount / totalCount) * 100).toFixed(1) : "0.0",
      totalCostFcfa: Math.round(totalCost),
      appBreakdown: Object.values(appBreakdown),
      currency: "FCFA",
      timezone: "Africa/Bamako",
    });
  }

  // Fallback mémoire
  const list = Array.from(inMemoryDb.messages.values());
  const totalCount = list.length;
  const deliveredCount = list.filter((m) => ["delivered", "accepted", "sent"].includes(m.status)).length;
  const failedCount = list.filter((m) => m.status === "failed").length;
  const totalCost = list.reduce((acc, m) => acc + (m.actualCostFcfa || m.estimatedCostFcfa || 0), 0);

  const appBreakdown: Record<string, { name: string; count: number; costFcfa: number }> = {};
  for (const m of list) {
    const app = inMemoryDb.applications.get(m.applicationId);
    const appName = app ? app.name : "Autre";
    if (!appBreakdown[appName]) {
      appBreakdown[appName] = { name: appName, count: 0, costFcfa: 0 };
    }
    appBreakdown[appName].count += 1;
    appBreakdown[appName].costFcfa += m.actualCostFcfa || m.estimatedCostFcfa || 0;
  }

  return NextResponse.json({
    totalMessages: totalCount,
    deliveredMessages: deliveredCount,
    failedMessages: failedCount,
    deliveryRate: totalCount > 0 ? ((deliveredCount / totalCount) * 100).toFixed(1) : "100.0",
    failureRate: totalCount > 0 ? ((failedCount / totalCount) * 100).toFixed(1) : "0.0",
    totalCostFcfa: Math.round(totalCost),
    appBreakdown: Object.values(appBreakdown),
    currency: "FCFA",
    timezone: "Africa/Bamako",
  });
}
