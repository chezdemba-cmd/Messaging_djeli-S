import { SmsType, SmsStatus } from "@/types/sms";

export interface DjelisClientConfig {
  apiKey: string;
  baseUrl?: string;
}

export interface SendSmsClientOptions {
  to: string;
  message?: string;
  template?: string;
  variables?: Record<string, string | number>;
  type?: SmsType;
  senderId?: string;
  idempotencyKey: string;
}

export interface SendSmsClientResponse {
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

export interface MessageStatusResponse {
  success: boolean;
  message: {
    id: string;
    recipientMasked: string;
    status: SmsStatus;
    smsType: SmsType;
    providerMessageId?: string;
    segments: number;
    estimatedCostFcfa: number;
    actualCostFcfa?: number;
    queuedAt: string;
    sentAt?: string;
    deliveredAt?: string;
    failedAt?: string;
    errorCode?: string;
    errorMessage?: string;
  };
}

/**
 * Client SDK officiel pour intégrer Djeli'S Messaging dans les applications :
 * TAKO, Sigi, Siraba, Comy_stock et futures plateformes.
 */
export class DjelisMessagingClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(config: DjelisClientConfig) {
    if (!config.apiKey) {
      throw new Error("DjelisMessagingClient : 'apiKey' est obligatoire");
    }
    this.apiKey = config.apiKey;
    let url = config.baseUrl || "https://messaging.djelis.com";
    if (url.endsWith("/")) {
      url = url.slice(0, -1);
    }
    this.baseUrl = url;
  }

  /**
   * Envoie un SMS direct ou basé sur un modèle avec garantie d'idempotence.
   */
  public async sendSms(options: SendSmsClientOptions): Promise<SendSmsClientResponse> {
    const url = `${this.baseUrl}/api/v1/sms/send`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Idempotency-Key": options.idempotencyKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: options.to,
        message: options.message,
        template: options.template,
        variables: options.variables,
        type: options.type || "transactional",
        senderId: options.senderId,
      }),
    });

    const data = await response.json();

    if (!response.ok && !data.messageId) {
      throw new Error(
        `[Djeli'S API Error] ${data.errorCode || "HTTP_" + response.status}: ${data.errorMessage || "Échec d'envoi"}`
      );
    }

    return data as SendSmsClientResponse;
  }

  /**
   * Récupère le statut en temps réel d'un SMS envoyé.
   */
  public async getMessage(messageId: string): Promise<MessageStatusResponse> {
    const url = `${this.baseUrl}/api/v1/sms/${encodeURIComponent(messageId)}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(`[Djeli'S API Error] ${err.errorMessage || "Message introuvable"}`);
    }

    return response.json();
  }

  /**
   * Récupère les quotas et la consommation de l'application cliente.
   */
  public async getUsage(): Promise<unknown> {
    const url = `${this.baseUrl}/api/v1/usage`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
    });

    return response.json();
  }
}
