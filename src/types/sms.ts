export type SmsType = "otp" | "transactional" | "marketing";

export type SmsStatus =
  | "queued"
  | "processing"
  | "accepted"
  | "sent"
  | "delivered"
  | "failed"
  | "unknown";

export type NetworkCode = "ORANGE" | "MOOV" | "TELECEL" | "UNKNOWN" | string;

export interface SmsRequest {
  to: string;
  message: string;
  senderId?: string;
  type: SmsType;
  applicationId: string;
  idempotencyKey: string;
}

export interface SmsResult {
  success: boolean;
  provider: string;
  providerMessageId?: string;
  status: SmsStatus;
  errorCode?: string;
  errorMessage?: string;
  estimatedCost?: number;
  /**
   * Permet de savoir si l'échec s'est produit AVANT toute transmission
   * ou si c'est un rejet catégorique autorisant un basculement immédiat.
   */
  canFailover?: boolean;
}

export interface SmsProvider {
  readonly name: string;
  isConfigured(): boolean;
  send(request: SmsRequest): Promise<SmsResult>;
  getStatus(providerMessageId: string): Promise<SmsResult>;
  verifyWebhook?(payload: unknown, headers: Headers): Promise<boolean>;
}

export interface RoutingRule {
  id: string;
  countryCode: string;
  networkCode: string;
  smsType: SmsType;
  providerId: string;
  providerCode: string;
  priority: number;
  enabled: boolean;
  costPerSegmentFcfa: number;
}

export interface PhoneDetails {
  e164: string;
  countryCode: string; // Ex: '223'
  nationalNumber: string;
  network: NetworkCode;
  masked: string;
  isValid: boolean;
}

export interface SegmentCalculation {
  encoding: "GSM-7" | "UNICODE";
  characterCount: number;
  segmentCount: number;
  maxCharactersPerSegment: number;
  remainingCharactersInSegment: number;
}
