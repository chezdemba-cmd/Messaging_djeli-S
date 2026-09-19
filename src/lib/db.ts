import { getServiceSupabase } from "./supabase";
import { hashApiKey, verifyApiKeyHash, sanitizeMetadata } from "./security";
import { hashPhoneNumber } from "./phone";
import { SmsType, SmsStatus, RoutingRule } from "@/types/sms";

export interface AppEntity {
  id: string;
  name: string;
  slug: string;
  status: "active" | "suspended" | "archived";
  dailyLimit: number;
  monthlyLimit: number;
}

export interface ApiKeyEntity {
  id: string;
  applicationId: string;
  keyPrefix: string;
  keyHash: string;
  revokedAt: string | null;
  expiresAt: string | null;
}

export interface TemplateEntity {
  id: string;
  applicationId: string | null;
  name: string;
  slug: string;
  content: string;
  smsType: SmsType;
  senderId?: string;
  variables: string[];
  active: boolean;
}

export interface MessageRecord {
  id: string;
  applicationId: string;
  recipientMasked: string;
  countryCode: string;
  networkCode?: string;
  smsType: SmsType;
  senderId?: string;
  body: string;
  templateId?: string;
  providerId?: string;
  providerCode?: string;
  providerMessageId?: string;
  status: SmsStatus;
  segmentCount: number;
  estimatedCostFcfa: number;
  actualCostFcfa?: number;
  idempotencyKey: string;
  errorCode?: string;
  errorMessage?: string;
  queuedAt: string;
  sentAt?: string;
  deliveredAt?: string;
  failedAt?: string;
  createdAt: string;
}

// ==============================================================================
// BASE DE DONNÉES EN MÉMOIRE (FALLBACK ET TESTS UNITAIRES)
// ==============================================================================
class InMemoryStore {
  public applications: Map<string, AppEntity> = new Map([
    ["b0000000-0000-0000-0000-000000000001", { id: "b0000000-0000-0000-0000-000000000001", name: "TAKO", slug: "tako", status: "active", dailyLimit: 20000, monthlyLimit: 500000 }],
    ["b0000000-0000-0000-0000-000000000002", { id: "b0000000-0000-0000-0000-000000000002", name: "Sigi", slug: "sigi", status: "active", dailyLimit: 10000, monthlyLimit: 250000 }],
    ["b0000000-0000-0000-0000-000000000003", { id: "b0000000-0000-0000-0000-000000000003", name: "Siraba", slug: "siraba", status: "active", dailyLimit: 15000, monthlyLimit: 350000 }],
    ["b0000000-0000-0000-0000-000000000004", { id: "b0000000-0000-0000-0000-000000000004", name: "Comy_stock", slug: "comy_stock", status: "active", dailyLimit: 5000, monthlyLimit: 100000 }],
  ]);

  public apiKeys: Map<string, ApiKeyEntity> = new Map();
  public messages: Map<string, MessageRecord> = new Map();
  public idempotencyIndex: Map<string, string> = new Map(); // key: `${appId}:${idempotencyKey}` -> messageId
  public optOuts: Set<string> = new Set(); // phoneHash
  public contacts: Map<string, { consentTransactional: boolean; consentMarketing: boolean }> = new Map(); // `${appId}:${phoneHash}`
  public templates: Map<string, TemplateEntity> = new Map([
    [
      "otp_standard",
      {
        id: "tpl-001",
        applicationId: null,
        name: "Code OTP Standard",
        slug: "otp_standard",
        content: "Votre code de verification Djeli'S est {{code}}. Valable 5 minutes.",
        smsType: "otp",
        senderId: "DJELIS",
        variables: ["code"],
        active: true,
      },
    ],
    [
      "commande_confirmee",
      {
        id: "tpl-002",
        applicationId: null,
        name: "Confirmation de Commande",
        slug: "commande_confirmee",
        content: "Bonjour {{client}}, votre commande {{numero}} est confirmee avec succes.",
        smsType: "transactional",
        senderId: "DJELIS",
        variables: ["client", "numero"],
        active: true,
      },
    ],
  ]);

  public routingRules: RoutingRule[] = [
    {
      id: "rule-001",
      countryCode: "223",
      networkCode: "*",
      smsType: "otp",
      providerId: "a0000000-0000-0000-0000-000000000001",
      providerCode: "infobip",
      priority: 1,
      enabled: true,
      costPerSegmentFcfa: 22.5,
    },
    {
      id: "rule-002",
      countryCode: "223",
      networkCode: "*",
      smsType: "otp",
      providerId: "a0000000-0000-0000-0000-000000000002",
      providerCode: "mock",
      priority: 99,
      enabled: true,
      costPerSegmentFcfa: 0.0,
    },
    {
      id: "rule-003",
      countryCode: "223",
      networkCode: "*",
      smsType: "transactional",
      providerId: "a0000000-0000-0000-0000-000000000001",
      providerCode: "infobip",
      priority: 1,
      enabled: true,
      costPerSegmentFcfa: 22.5,
    },
    {
      id: "rule-004",
      countryCode: "223",
      networkCode: "*",
      smsType: "marketing",
      providerId: "a0000000-0000-0000-0000-000000000001",
      providerCode: "infobip",
      priority: 1,
      enabled: true,
      costPerSegmentFcfa: 20.0,
    },
    {
      id: "rule-005",
      countryCode: "*",
      networkCode: "*",
      smsType: "otp",
      providerId: "a0000000-0000-0000-0000-000000000001",
      providerCode: "infobip",
      priority: 1,
      enabled: true,
      costPerSegmentFcfa: 30.0,
    },
  ];

  constructor() {
    // Clé API de test pré-générée pour TAKO : dj_live_tako_test_key_1234567890
    const takoTestKey = "dj_live_tako_test_key_1234567890";
    this.apiKeys.set("key-tako-1", {
      id: "key-tako-1",
      applicationId: "b0000000-0000-0000-0000-000000000001",
      keyPrefix: takoTestKey.slice(0, 16),
      keyHash: hashApiKey(takoTestKey),
      revokedAt: null,
      expiresAt: null,
    });
  }

  public reset(): void {
    this.messages.clear();
    this.idempotencyIndex.clear();
    this.optOuts.clear();
    this.contacts.clear();
  }
}

export const inMemoryDb = new InMemoryStore();

// ==============================================================================
// SERVICES D'ACCÈS AUX DONNÉES
// ==============================================================================

/**
 * Authentifie une clé API applicative (Bearer dj_live_...).
 * Vérifie le hash SHA-256, l'absence de révocation et la date d'expiration.
 */
export async function authenticateApiKey(rawKey: string): Promise<AppEntity | null> {
  if (!rawKey || !rawKey.startsWith("dj_live_")) {
    return null;
  }

  const supabase = getServiceSupabase();
  const prefix = rawKey.slice(0, 16);

  if (supabase) {
    const { data: keyRecord } = await supabase
      .from("api_keys")
      .select("*, applications(*)")
      .eq("key_prefix", prefix)
      .is("revoked_at", null)
      .single();

    if (!keyRecord) return null;

    if (keyRecord.expires_at && new Date(keyRecord.expires_at) < new Date()) {
      return null;
    }

    if (!verifyApiKeyHash(rawKey, keyRecord.key_hash)) {
      return null;
    }

    // Mise à jour asynchrone de last_used_at
    supabase
      .from("api_keys")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", keyRecord.id)
      .then();

    return {
      id: keyRecord.applications.id,
      name: keyRecord.applications.name,
      slug: keyRecord.applications.slug,
      status: keyRecord.applications.status,
      dailyLimit: keyRecord.applications.daily_limit,
      monthlyLimit: keyRecord.applications.monthly_limit,
    };
  }

  // Mode mémoire / test
  for (const keyEntity of inMemoryDb.apiKeys.values()) {
    if (keyEntity.keyPrefix === prefix && !keyEntity.revokedAt) {
      if (keyEntity.expiresAt && new Date(keyEntity.expiresAt) < new Date()) {
        return null;
      }
      if (verifyApiKeyHash(rawKey, keyEntity.keyHash)) {
        return inMemoryDb.applications.get(keyEntity.applicationId) || null;
      }
    }
  }

  return null;
}

/**
 * Vérifie l'idempotence d'une requête SMS.
 * Si un message a déjà été soumis avec la même clé par cette application, le renvoie.
 */
export async function findMessageByIdempotency(
  applicationId: string,
  idempotencyKey: string
): Promise<MessageRecord | null> {
  const supabase = getServiceSupabase();

  if (supabase) {
    const { data } = await supabase
      .from("messages")
      .select("*")
      .eq("application_id", applicationId)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();

    if (!data) return null;

    return {
      id: data.id,
      applicationId: data.application_id,
      recipientMasked: data.recipient_masked,
      countryCode: data.country_code,
      networkCode: data.network_code,
      smsType: data.sms_type,
      senderId: data.sender_id,
      body: data.body,
      providerId: data.provider_id,
      providerMessageId: data.provider_message_id,
      status: data.status,
      segmentCount: data.segment_count,
      estimatedCostFcfa: Number(data.estimated_cost_fcfa),
      actualCostFcfa: data.actual_cost_fcfa ? Number(data.actual_cost_fcfa) : undefined,
      idempotencyKey: data.idempotency_key,
      errorCode: data.error_code,
      errorMessage: data.error_message,
      queuedAt: data.queued_at,
      sentAt: data.sent_at,
      deliveredAt: data.delivered_at,
      failedAt: data.failed_at,
      createdAt: data.created_at,
    };
  }

  const lookupKey = `${applicationId}:${idempotencyKey}`;
  const messageId = inMemoryDb.idempotencyIndex.get(lookupKey);
  if (messageId) {
    return inMemoryDb.messages.get(messageId) || null;
  }

  return null;
}

/**
 * Vérifie si le numéro est inscrit sur la liste d'opposition (opt-out).
 */
export async function isPhoneOptedOut(
  applicationId: string,
  phoneE164: string
): Promise<boolean> {
  const phoneHash = hashPhoneNumber(phoneE164);
  const supabase = getServiceSupabase();

  if (supabase) {
    const { data } = await supabase
      .from("opt_outs")
      .select("id")
      .eq("phone_hash", phoneHash)
      .or(`application_id.eq.${applicationId},application_id.is.null`)
      .limit(1);

    return Boolean(data && data.length > 0);
  }

  return inMemoryDb.optOuts.has(phoneHash);
}

/**
 * Vérifie si le contact a consenti à recevoir des messages marketing.
 */
export async function hasMarketingConsent(
  applicationId: string,
  phoneE164: string
): Promise<boolean> {
  const phoneHash = hashPhoneNumber(phoneE164);
  const supabase = getServiceSupabase();

  if (supabase) {
    const { data } = await supabase
      .from("contacts")
      .select("consent_marketing")
      .eq("application_id", applicationId)
      .eq("phone_hash", phoneHash)
      .maybeSingle();

    return Boolean(data?.consent_marketing);
  }

  const contact = inMemoryDb.contacts.get(`${applicationId}:${phoneHash}`);
  return Boolean(contact?.consentMarketing);
}

/**
 * Récupère un modèle SMS par son slug.
 */
export async function getTemplateBySlug(
  applicationId: string,
  slug: string
): Promise<TemplateEntity | null> {
  const supabase = getServiceSupabase();

  if (supabase) {
    const { data } = await supabase
      .from("templates")
      .select("*")
      .eq("slug", slug)
      .or(`application_id.eq.${applicationId},application_id.is.null`)
      .eq("active", true)
      .order("application_id", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    if (!data) return null;

    return {
      id: data.id,
      applicationId: data.application_id,
      name: data.name,
      slug: data.slug,
      content: data.content,
      smsType: data.sms_type,
      senderId: data.sender_id,
      variables: data.variables || [],
      active: data.active,
    };
  }

  const tpl = inMemoryDb.templates.get(slug);
  if (tpl && tpl.active && (tpl.applicationId === null || tpl.applicationId === applicationId)) {
    return tpl;
  }

  return null;
}

/**
 * Récupère les règles de routage actives ordonnées par priorité.
 */
export async function getActiveRoutingRules(): Promise<RoutingRule[]> {
  const supabase = getServiceSupabase();

  if (supabase) {
    const { data } = await supabase
      .from("routing_rules")
      .select("*, providers(id, code, enabled)")
      .eq("enabled", true)
      .order("priority", { ascending: true });

    if (!data) return [];

    return data
      .filter((r) => r.providers?.enabled)
      .map((r) => ({
        id: r.id,
        countryCode: r.country_code,
        networkCode: r.network_code,
        smsType: r.sms_type,
        providerId: r.provider_id,
        providerCode: r.providers.code,
        priority: r.priority,
        enabled: r.enabled,
        costPerSegmentFcfa: Number(r.cost_per_segment_fcfa),
      }));
  }

  return inMemoryDb.routingRules;
}

/**
 * Enregistre un message en base.
 */
export async function createMessage(msg: MessageRecord): Promise<void> {
  const supabase = getServiceSupabase();

  if (supabase) {
    await supabase.from("messages").insert({
      id: msg.id,
      application_id: msg.applicationId,
      recipient_masked: msg.recipientMasked,
      country_code: msg.countryCode,
      network_code: msg.networkCode,
      sms_type: msg.smsType,
      sender_id: msg.senderId,
      body: msg.body,
      provider_message_id: msg.providerMessageId,
      status: msg.status,
      segment_count: msg.segmentCount,
      estimated_cost_fcfa: msg.estimatedCostFcfa,
      idempotency_key: msg.idempotencyKey,
      error_code: msg.errorCode,
      error_message: msg.errorMessage,
      queued_at: msg.queuedAt,
      created_at: msg.createdAt,
    });
  }

  inMemoryDb.messages.set(msg.id, msg);
  inMemoryDb.idempotencyIndex.set(`${msg.applicationId}:${msg.idempotencyKey}`, msg.id);
}

/**
 * Met à jour le statut d'un message et ses horodatages.
 */
export async function updateMessageStatus(
  messageId: string,
  update: {
    status: SmsStatus;
    providerId?: string;
    providerMessageId?: string;
    errorCode?: string;
    errorMessage?: string;
    actualCostFcfa?: number;
    sentAt?: string;
    deliveredAt?: string;
    failedAt?: string;
  }
): Promise<void> {
  const supabase = getServiceSupabase();

  if (supabase) {
    await supabase
      .from("messages")
      .update({
        status: update.status,
        provider_id: update.providerId,
        provider_message_id: update.providerMessageId,
        error_code: update.errorCode,
        error_message: update.errorMessage,
        actual_cost_fcfa: update.actualCostFcfa,
        sent_at: update.sentAt,
        delivered_at: update.deliveredAt,
        failed_at: update.failedAt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", messageId);
  }

  const existing = inMemoryDb.messages.get(messageId);
  if (existing) {
    Object.assign(existing, update);
  }
}

/**
 * Enregistre une tentative d'envoi dans message_attempts.
 */
export async function recordMessageAttempt(
  messageId: string,
  providerId: string,
  attemptNumber: number,
  status: SmsStatus,
  providerMessageId?: string,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  const supabase = getServiceSupabase();
  const safeMeta = sanitizeMetadata(metadata);

  if (supabase) {
    await supabase.from("message_attempts").insert({
      message_id: messageId,
      provider_id: providerId,
      attempt_number: attemptNumber,
      status,
      provider_message_id: providerMessageId,
      response_metadata: safeMeta,
      completed_at: new Date().toISOString(),
    });
  }
}

/**
 * Enregistre un événement de livraison (webhook DLR).
 */
export async function recordDeliveryEvent(
  messageId: string | undefined,
  providerId: string,
  eventType: string,
  providerStatus: string,
  normalizedStatus: SmsStatus,
  payload: Record<string, unknown>
): Promise<void> {
  const supabase = getServiceSupabase();
  const safePayload = sanitizeMetadata(payload);

  if (supabase) {
    await supabase.from("delivery_events").insert({
      message_id: messageId,
      provider_id: providerId,
      event_type: eventType,
      provider_status: providerStatus,
      normalized_status: normalizedStatus,
      payload: safePayload,
    });
  }
}
