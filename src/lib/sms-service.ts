import crypto from "node:crypto";
import { SendSmsInput } from "./schemas";
import { parseAndNormalizePhone, hashPhoneNumber } from "./phone";
import { calculateSmsSegments } from "./segments";
import { renderTemplate } from "./templates";
import { checkOtpPumpingGuard } from "./rate-limit";
import {
  AppEntity,
  findMessageByIdempotency,
  isPhoneOptedOut,
  hasMarketingConsent,
  getTemplateBySlug,
  getActiveRoutingRules,
  createMessage,
  updateMessageStatus,
  recordMessageAttempt,
  MessageRecord,
} from "./db";
import { RoutingEngine } from "./routing";
import { SmsRequest, SmsStatus } from "@/types/sms";

export interface SendSmsResultOutput {
  success: boolean;
  messageId: string;
  status: SmsStatus;
  provider: string;
  segments: number;
  estimatedCostFcfa: number;
  duplicate?: boolean;
  errorCode?: string;
  errorMessage?: string;
}

export class SmsService {
  private routingEngine: RoutingEngine;

  constructor(routingEngine?: RoutingEngine) {
    this.routingEngine = routingEngine || new RoutingEngine();
  }

  public async processSms(
    app: AppEntity,
    input: SendSmsInput,
    idempotencyKey: string
  ): Promise<SendSmsResultOutput> {
    // 1. Contrôle d'idempotence strict (combiné application_id + idempotency_key)
    const existing = await findMessageByIdempotency(app.id, idempotencyKey);
    if (existing) {
      return {
        success: existing.status !== "failed",
        messageId: existing.id,
        status: existing.status,
        provider: existing.providerCode || "unknown",
        segments: existing.segmentCount,
        estimatedCostFcfa: existing.estimatedCostFcfa,
        duplicate: true,
      };
    }

    // 2. Normalisation et validation E.164 du numéro
    const phone = parseAndNormalizePhone(input.to);
    if (!phone.isValid) {
      return {
        success: false,
        messageId: "",
        status: "failed",
        provider: "none",
        segments: 0,
        estimatedCostFcfa: 0,
        errorCode: "INVALID_PHONE_NUMBER",
        errorMessage: `Le numéro de téléphone '${input.to}' n'est pas un numéro E.164 valide.`,
      };
    }

    const phoneHash = hashPhoneNumber(phone.e164);

    // 3. Prévention des abus et SMS Pumping sur les OTP
    if (input.type === "otp") {
      const otpGuard = checkOtpPumpingGuard(phoneHash);
      if (!otpGuard.allowed) {
        return {
          success: false,
          messageId: "",
          status: "failed",
          provider: "none",
          segments: 0,
          estimatedCostFcfa: 0,
          errorCode: "OTP_RATE_LIMIT_EXCEEDED",
          errorMessage: `Trop de demandes OTP pour ce numéro. Réessayez dans ${otpGuard.retryAfterSeconds} secondes.`,
        };
      }
    }

    // 4. Vérification de la liste d'opposition (opt-outs)
    const isOptedOut = await isPhoneOptedOut(app.id, phone.e164);
    if (isOptedOut) {
      return {
        success: false,
        messageId: "",
        status: "failed",
        provider: "none",
        segments: 0,
        estimatedCostFcfa: 0,
        errorCode: "RECIPIENT_OPTED_OUT",
        errorMessage: "Le destinataire est inscrit sur la liste d'opposition aux messages.",
      };
    }

    // 5. Vérification du consentement pour les SMS Marketing
    if (input.type === "marketing") {
      const hasConsent = await hasMarketingConsent(app.id, phone.e164);
      if (!hasConsent) {
        return {
          success: false,
          messageId: "",
          status: "failed",
          provider: "none",
          segments: 0,
          estimatedCostFcfa: 0,
          errorCode: "MARKETING_CONSENT_REQUIRED",
          errorMessage: "Envoi marketing refusé : aucun consentement explicite préalable pour ce numéro.",
        };
      }
    }

    // 6. Résolution du contenu : texte direct ou modèle
    let finalBody = "";
    let templateId: string | undefined;

    if (input.template) {
      const template = await getTemplateBySlug(app.id, input.template);
      if (!template) {
        return {
          success: false,
          messageId: "",
          status: "failed",
          provider: "none",
          segments: 0,
          estimatedCostFcfa: 0,
          errorCode: "TEMPLATE_NOT_FOUND",
          errorMessage: `Le modèle '${input.template}' est introuvable ou inactif.`,
        };
      }

      const rendered = renderTemplate(
        template.content,
        template.variables,
        input.variables || {}
      );

      if (!rendered.success || !rendered.renderedText) {
        return {
          success: false,
          messageId: "",
          status: "failed",
          provider: "none",
          segments: 0,
          estimatedCostFcfa: 0,
          errorCode: "TEMPLATE_RENDER_ERROR",
          errorMessage: rendered.error || "Erreur de rendu du modèle.",
        };
      }

      finalBody = rendered.renderedText;
      templateId = template.id;
    } else {
      finalBody = input.message!;
    }

    // 7. Calcul précis des segments et encodage (GSM-7 vs Unicode)
    const segmentCalc = calculateSmsSegments(finalBody);

    // 8. Création initiale de l'enregistrement du message
    const messageId = crypto.randomUUID();
    const messageRecord: MessageRecord = {
      id: messageId,
      applicationId: app.id,
      recipientMasked: phone.masked,
      countryCode: phone.countryCode || "223",
      networkCode: phone.network,
      smsType: input.type,
      senderId: input.senderId || "DJELIS",
      body: finalBody,
      templateId,
      status: "processing",
      segmentCount: segmentCalc.segmentCount,
      estimatedCostFcfa: 0,
      idempotencyKey,
      queuedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };

    await createMessage(messageRecord);

    // 9. Exécution du routage multi-fournisseurs avec Safe Failover
    const routingRules = await getActiveRoutingRules();
    const smsRequest: SmsRequest = {
      to: phone.e164,
      message: finalBody,
      senderId: input.senderId || "DJELIS",
      type: input.type,
      applicationId: app.id,
      idempotencyKey,
    };

    const routingOutcome = await this.routingEngine.executeSafeRouting(
      smsRequest,
      phone,
      routingRules,
      segmentCalc.segmentCount
    );

    // 10. Enregistrement des tentatives dans message_attempts
    for (const attempt of routingOutcome.attempts) {
      await recordMessageAttempt(
        messageId,
        attempt.providerName,
        attempt.attemptNumber,
        attempt.result.status,
        attempt.result.providerMessageId,
        {
          errorCode: attempt.result.errorCode,
          errorMessage: attempt.result.errorMessage,
        }
      );
    }

    // 11. Mise à jour finale du message
    const finalStatus = routingOutcome.finalResult.status;
    const nowIso = new Date().toISOString();

    await updateMessageStatus(messageId, {
      status: finalStatus,
      providerMessageId: routingOutcome.finalResult.providerMessageId,
      errorCode: routingOutcome.finalResult.errorCode,
      errorMessage: routingOutcome.finalResult.errorMessage,
      actualCostFcfa: routingOutcome.finalResult.success
        ? routingOutcome.estimatedCostFcfa
        : undefined,
      sentAt: finalStatus === "sent" || finalStatus === "delivered" ? nowIso : undefined,
      deliveredAt: finalStatus === "delivered" ? nowIso : undefined,
      failedAt: finalStatus === "failed" ? nowIso : undefined,
    });

    return {
      success: routingOutcome.finalResult.success,
      messageId,
      status: finalStatus,
      provider: routingOutcome.selectedProvider,
      segments: segmentCalc.segmentCount,
      estimatedCostFcfa: routingOutcome.estimatedCostFcfa,
      errorCode: routingOutcome.finalResult.errorCode,
      errorMessage: routingOutcome.finalResult.errorMessage,
    };
  }
}
