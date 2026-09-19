import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey, inMemoryDb } from "@/lib/db";
import { getServiceSupabase } from "@/lib/supabase";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Authentification de la clé API
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
      const { data: msg } = await supabase
        .from("messages")
        .select("*, message_attempts(*)")
        .eq("id", id)
        .eq("application_id", app.id)
        .maybeSingle();

      if (!msg) {
        return NextResponse.json(
          { success: false, errorCode: "NOT_FOUND", errorMessage: "Message introuvable" },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        message: {
          id: msg.id,
          recipientMasked: msg.recipient_masked,
          status: msg.status,
          smsType: msg.sms_type,
          providerMessageId: msg.provider_message_id,
          segments: msg.segment_count,
          estimatedCostFcfa: Number(msg.estimated_cost_fcfa),
          actualCostFcfa: msg.actual_cost_fcfa ? Number(msg.actual_cost_fcfa) : undefined,
          queuedAt: msg.queued_at,
          sentAt: msg.sent_at,
          deliveredAt: msg.delivered_at,
          failedAt: msg.failed_at,
          errorCode: msg.error_code,
          errorMessage: msg.error_message,
        },
      });
    }

    // Fallback store mémoire
    const memMsg = inMemoryDb.messages.get(id);
    if (!memMsg || memMsg.applicationId !== app.id) {
      return NextResponse.json(
        { success: false, errorCode: "NOT_FOUND", errorMessage: "Message introuvable" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: {
        id: memMsg.id,
        recipientMasked: memMsg.recipientMasked,
        status: memMsg.status,
        smsType: memMsg.smsType,
        providerMessageId: memMsg.providerMessageId,
        segments: memMsg.segmentCount,
        estimatedCostFcfa: memMsg.estimatedCostFcfa,
        actualCostFcfa: memMsg.actualCostFcfa,
        queuedAt: memMsg.queuedAt,
        sentAt: memMsg.sentAt,
        deliveredAt: memMsg.deliveredAt,
        failedAt: memMsg.failedAt,
        errorCode: memMsg.errorCode,
        errorMessage: memMsg.errorMessage,
      },
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { success: false, errorCode: "INTERNAL_ERROR", errorMessage: "Erreur serveur" },
      { status: 500 }
    );
  }
}
