import crypto from "node:crypto";

export interface GeneratedApiKey {
  rawKey: string;
  prefix: string;
  hash: string;
}

/**
 * Génère une clé API sécurisée avec préfixe reconnaissable.
 * Exemple de format : dj_live_4f89a71b239c0e5d883b1298471630aa
 */
export function generateApiKey(): GeneratedApiKey {
  const randomBytes = crypto.randomBytes(24).toString("hex");
  const rawKey = `dj_live_${randomBytes}`;
  const prefix = rawKey.slice(0, 16);
  const hash = hashApiKey(rawKey);

  return {
    rawKey,
    prefix,
    hash,
  };
}

/**
 * Calcule le hachage SHA-256 d'une clé API pour comparaison et stockage en base.
 */
export function hashApiKey(rawKey: string): string {
  return crypto.createHash("sha256").update(rawKey.trim()).digest("hex");
}

/**
 * Vérifie de manière cryptographiquement sûre (timing attack resistant)
 * si deux hachages sont identiques.
 */
export function verifyApiKeyHash(inputKey: string, storedHash: string): boolean {
  try {
    const inputHash = hashApiKey(inputKey);
    const bufA = Buffer.from(inputHash, "utf-8");
    const bufB = Buffer.from(storedHash, "utf-8");

    if (bufA.length !== bufB.length) {
      return false;
    }

    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

/**
 * Nettoie les données sensibles (clés, tokens, numéros complets)
 * pour éviter toute fuite dans les journaux d'audit ou les réponses d'erreur.
 */
export function sanitizeMetadata(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== "object") {
    return {};
  }

  const sensitiveKeys = [
    "authorization",
    "apikey",
    "api_key",
    "password",
    "token",
    "secret",
    "client_secret",
    "infobip_api_key",
  ];

  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    const lowerKey = key.toLowerCase();
    const isSensitive = sensitiveKeys.some((s) => lowerKey.includes(s));

    if (isSensitive) {
      sanitized[key] = "[REDACTED]";
    } else if (typeof value === "object" && value !== null) {
      sanitized[key] = sanitizeMetadata(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}
