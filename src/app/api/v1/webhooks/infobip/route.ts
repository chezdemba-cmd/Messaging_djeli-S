import { NextRequest, NextResponse } from "next/server";
import { InfobipProvider } from "@/providers/infobip.provider";
import { getServiceSupabase } from "@/lib/supabase";
import { recordDeliveryEvent, inMemoryDb } from "@/lib/db";

const infobip = new InfobipProvider();

interface InfobipDlrResult {
  messageId: string;
  to?: string;
  status?: {
    groupId: number;
    groupName: string;
    id: number;
    name: string;
    description: string;
  };
  price?: {
    pricePerMessage: number;
    currency: string;
  };
  doneAt?: string;
}

export async function POST(request: NextRequest) {
  try {
    let payload: { results?: InfobipDlrResult[] };

    try {
      payload = await request.json();
    } catch {
      return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
    }

    // Vérification de la signature / secret si configuré
    const isVerified = await infobip.verifyWebhook(payload, request.headers);
    if (!isVerified) {
      return NextResponse.json({ error: "Signature webhook invalide" }, { status: 401 });
    }

    const results = payload.results || [];
    const supabase = getServiceSupabase();

    for (const item of results) {
      const providerMessageId = item.messageId;
      const groupName = item.status?.groupName || "";
      const normalizedStatus = infobip.mapInfobipStatus(groupName);
      const doneAt = item.doneAt || new Date().toISOString();

      if (supabase) {
        // Recherche du message correspondant
        const { data: message } = await supabase
          .from("messages")
          .select("id")
          .eq("provider_message_id", providerMessageId)
          .maybeSingle();

        if (message) {
          // Mise à jour du message
          await supabase
            .from("messages")
            .update({
              status: normalizedStatus,
              delivered_at: normalizedStatus === "delivered" ? doneAt : undefined,
              failed_at: normalizedStatus === "failed" ? doneAt : undefined,
              updated_at: new Date().toISOString(),
            })
            .eq("id", message.id);

          await recordDeliveryEvent(
            message.id,
            "a0000000-0000-0000-0000-000000000001", // Infobip provider ID
            "DLR_REPORT",
            groupName,
            normalizedStatus,
            item as unknown as Record<string, unknown>
          );
        }
      } else {
        // Mise à jour dans le store mémoire
        for (const msg of inMemoryDb.messages.values()) {
          if (msg.providerMessageId === providerMessageId) {
            msg.status = normalizedStatus;
            if (normalizedStatus === "delivered") msg.deliveredAt = doneAt;
            if (normalizedStatus === "failed") msg.failedAt = doneAt;
          }
        }
      }
    }

    return NextResponse.json({ received: true, count: results.length }, { status: 200 });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Erreur interne webhook";
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
