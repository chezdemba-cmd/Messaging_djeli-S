import { NextRequest, NextResponse } from "next/server";
import { getActiveRoutingRules, inMemoryDb } from "@/lib/db";
import { getServiceSupabase } from "@/lib/supabase";

export async function GET() {
  const supabase = getServiceSupabase();

  if (supabase) {
    const { data: rules } = await supabase
      .from("routing_rules")
      .select("*, providers(name, code)")
      .order("priority", { ascending: true });

    return NextResponse.json({ rules: rules || [] });
  }

  const rules = inMemoryDb.routingRules;
  return NextResponse.json({ rules });
}

export async function PATCH(request: NextRequest) {
  let body: { ruleId?: string; enabled?: boolean; priority?: number; costPerSegmentFcfa?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
  }

  if (!body.ruleId) {
    return NextResponse.json({ error: "ruleId requis" }, { status: 400 });
  }

  const supabase = getServiceSupabase();
  if (supabase) {
    const { data, error } = await supabase
      .from("routing_rules")
      .update({
        ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
        ...(body.priority !== undefined ? { priority: body.priority } : {}),
        ...(body.costPerSegmentFcfa !== undefined ? { cost_per_segment_fcfa: body.costPerSegmentFcfa } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", body.ruleId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, rule: data });
  }

  const rule = inMemoryDb.routingRules.find((r) => r.id === body.ruleId);
  if (!rule) {
    return NextResponse.json({ error: "Règle introuvable" }, { status: 404 });
  }

  if (body.enabled !== undefined) rule.enabled = body.enabled;
  if (body.priority !== undefined) rule.priority = body.priority;
  if (body.costPerSegmentFcfa !== undefined) rule.costPerSegmentFcfa = body.costPerSegmentFcfa;

  return NextResponse.json({ success: true, rule });
}
