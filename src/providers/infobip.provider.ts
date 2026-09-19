import { SmsProvider, SmsRequest, SmsResult, SmsStatus } from "@/types/sms";

export interface InfobipConfig {
  baseUrl?: string;
  apiKey?: string;
  defaultSender?: string;
  notifyUrl?: string;
}

/**
 * Connecteur de production réel pour l'API REST Infobip.
 * Documentation : https://www.infobip.com/docs/api/channels/sms/send-sms-message
 */
export class InfobipProvider implements SmsProvider {
  public readonly name: string = "infobip";
  private baseUrl: string;
  private apiKey: string;
  private defaultSender: string;
  private notifyUrl?: string;

  constructor(config?: InfobipConfig) {
    let url = config?.baseUrl || process.env.INFOBIP_BASE_URL || "";
    if (url.endsWith("/")) {
      url = url.slice(0, -1);
    }
    this.baseUrl = url;
    this.apiKey = config?.apiKey || process.env.INFOBIP_API_KEY || "";
    this.defaultSender =
      config?.defaultSender || process.env.INFOBIP_DEFAULT_SENDER || "DJELIS";
    this.notifyUrl = config?.notifyUrl || process.env.INFOBIP_NOTIFY_URL;
  }

  public isConfigured(): boolean {
    return Boolean(this.baseUrl && this.apiKey);
  }

  /**
   * Vérifie la validité des identifiants Infobip en interrogeant le solde du compte
   * sans envoyer de SMS payant.
   */
  public async testConfiguration(): Promise<{ ok: boolean; message: string; balance?: number; currency?: string }> {
    if (!this.isConfigured()) {
      return { ok: false, message: "INFOBIP_BASE_URL ou INFOBIP_API_KEY manquant." };
    }

    try {
      const response = await fetch(`${this.baseUrl}/account/1/balance`, {
        method: "GET",
        headers: {
          Authorization: `App ${this.apiKey}`,
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        return {
          ok: false,
          message: `Authentification Infobip échouée (HTTP ${response.status})`,
        };
      }

      const data = await response.json();
      return {
        ok: true,
        message: "Connexion Infobip opérationnelle",
        balance: data.balance,
        currency: data.currency,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, message: `Erreur réseau Infobip : ${msg}` };
    }
  }

  public async send(request: SmsRequest): Promise<SmsResult> {
    if (!this.isConfigured()) {
      return {
        success: false,
        provider: this.name,
        status: "failed",
        errorCode: "INFOBIP_NOT_CONFIGURED",
        errorMessage: "Les identifiants Infobip ne sont pas configurés.",
        canFailover: true, // Échec avant transmission : basculement sécurisé possible
      };
    }

    const sender = request.senderId || this.defaultSender;
    const payload = {
      messages: [
        {
          destinations: [{ to: request.to }],
          from: sender,
          text: request.message,
          ...(this.notifyUrl ? { notifyUrl: this.notifyUrl } : {}),
        },
      ],
    };

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/sms/2/text/advanced`, {
        method: "POST",
        headers: {
          Authorization: `App ${this.apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      });
    } catch (fetchError: unknown) {
      // Erreur réseau ou timeout : nous ne savons pas si le message a été reçu par Infobip
      // Pour éviter les doublons, on refuse le basculement automatique et on passe en unknown
      const errMsg = fetchError instanceof Error ? fetchError.message : String(fetchError);
      return {
        success: false,
        provider: this.name,
        status: "unknown",
        errorCode: "NETWORK_TIMEOUT",
        errorMessage: `Erreur réseau vers Infobip : ${errMsg}`,
        canFailover: false, // INTERDICTION DE BASCULER en cas de statut incertain
      };
    }

    // Analyse de la réponse HTTP
    if (!response.ok) {
      let errorBody = "";
      try {
        errorBody = await response.text();
      } catch {
        errorBody = "Impossible de lire la réponse d'erreur";
      }

      // Rejet HTTP explicite avant acceptation (ex: 401 Unauthorized, 403 Forbidden, 400 Bad Request)
      const canFailover = response.status === 401 || response.status === 403 || response.status === 429;

      return {
        success: false,
        provider: this.name,
        status: "failed",
        errorCode: `INFOBIP_HTTP_${response.status}`,
        errorMessage: `Rejet Infobip : ${errorBody}`,
        canFailover,
      };
    }

    try {
      const data = await response.json();
      const firstMsg = data.messages?.[0];

      if (!firstMsg) {
        return {
          success: false,
          provider: this.name,
          status: "unknown",
          errorCode: "INVALID_RESPONSE_PAYLOAD",
          errorMessage: "Infobip n'a retourné aucun détail de message.",
          canFailover: false,
        };
      }

      const statusGroup = firstMsg.status?.groupName || "";
      const normalizedStatus = this.mapInfobipStatus(statusGroup);
      const isOk = normalizedStatus === "accepted" || normalizedStatus === "sent" || normalizedStatus === "delivered";

      return {
        success: isOk,
        provider: this.name,
        providerMessageId: firstMsg.messageId,
        status: normalizedStatus,
        errorCode: isOk ? undefined : firstMsg.status?.name,
        errorMessage: isOk ? undefined : firstMsg.status?.description,
        canFailover: false, // Dès que le fournisseur a répondu avec un messageId, basculement interdit
      };
    } catch (parseError: unknown) {
      return {
        success: true, // HTTP 200 reçu
        provider: this.name,
        status: "accepted",
        canFailover: false,
      };
    }
  }

  public async getStatus(providerMessageId: string): Promise<SmsResult> {
    if (!this.isConfigured()) {
      return {
        success: false,
        provider: this.name,
        providerMessageId,
        status: "failed",
        errorCode: "INFOBIP_NOT_CONFIGURED",
        errorMessage: "Infobip non configuré.",
      };
    }

    try {
      const response = await fetch(
        `${this.baseUrl}/sms/1/reports?messageId=${encodeURIComponent(providerMessageId)}`,
        {
          headers: {
            Authorization: `App ${this.apiKey}`,
            Accept: "application/json",
          },
        }
      );

      if (!response.ok) {
        return {
          success: false,
          provider: this.name,
          providerMessageId,
          status: "unknown",
          errorCode: `HTTP_${response.status}`,
        };
      }

      const data = await response.json();
      const report = data.results?.[0];

      if (!report) {
        return {
          success: false,
          provider: this.name,
          providerMessageId,
          status: "unknown",
        };
      }

      const normalized = this.mapInfobipStatus(report.status?.groupName || "");
      return {
        success: normalized === "delivered" || normalized === "sent" || normalized === "accepted",
        provider: this.name,
        providerMessageId,
        status: normalized,
      };
    } catch {
      return {
        success: false,
        provider: this.name,
        providerMessageId,
        status: "unknown",
      };
    }
  }

  /**
   * Normalisation des statuts Infobip vers le standard interne de Djeli'S.
   */
  public mapInfobipStatus(statusOrGroup: string): SmsStatus {
    const upper = (statusOrGroup || "").toUpperCase();
    if (upper.includes("DELIVERED")) {
      return "delivered";
    }
    if (upper.includes("PENDING")) {
      return "sent";
    }
    if (
      upper.includes("UNDELIVERABLE") ||
      upper.includes("REJECTED") ||
      upper.includes("EXPIRED") ||
      upper.includes("FAILED")
    ) {
      return "failed";
    }
    if (upper.includes("ACCEPTED")) {
      return "accepted";
    }
    return "accepted";
  }

  public async verifyWebhook(payload: unknown, headers: Headers): Promise<boolean> {
    // Si un token secret webhook est configuré, on le vérifie
    const webhookSecret = process.env.INFOBIP_WEBHOOK_SECRET;
    if (!webhookSecret) {
      return true; // Si pas de secret défini, accepter
    }

    const authHeader = headers.get("authorization") || headers.get("x-infobip-signature");
    if (!authHeader) {
      return false;
    }

    return authHeader.includes(webhookSecret);
  }
}
