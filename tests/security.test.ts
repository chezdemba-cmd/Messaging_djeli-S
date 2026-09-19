import { describe, it, expect } from "vitest";
import {
  generateApiKey,
  hashApiKey,
  verifyApiKeyHash,
  sanitizeMetadata,
} from "@/lib/security";

describe("Sécurité, Clés API et Assainissement", () => {
  it("génère une clé API avec préfixe reconnaissable et hachage valide", () => {
    const keyData = generateApiKey();
    expect(keyData.rawKey.startsWith("dj_live_")).toBe(true);
    expect(keyData.prefix).toHaveLength(16);
    expect(keyData.hash).toHaveLength(64);
    expect(verifyApiKeyHash(keyData.rawKey, keyData.hash)).toBe(true);
  });

  it("rejette une clé incorrecte face au hachage stocké", () => {
    const keyData = generateApiKey();
    expect(verifyApiKeyHash("dj_live_fake_key_123456789", keyData.hash)).toBe(false);
  });

  it("calcule un hachage SHA-256 déterministe", () => {
    const key = "dj_live_test_123";
    const h1 = hashApiKey(key);
    const h2 = hashApiKey(key);
    expect(h1).toBe(h2);
  });

  it("masque les secrets et jetons d'autorisation dans les métadonnées", () => {
    const dirty = {
      user: "admin",
      authorization: "Bearer secret-token",
      apiKey: "secret_12345",
      nested: {
        token: "jwt-token-999",
        safeValue: "ok",
      },
    };

    const clean = sanitizeMetadata(dirty) as Record<string, unknown>;
    expect(clean.authorization).toBe("[REDACTED]");
    expect(clean.apiKey).toBe("[REDACTED]");
    expect((clean.nested as Record<string, unknown>).token).toBe("[REDACTED]");
    expect((clean.nested as Record<string, unknown>).safeValue).toBe("ok");
  });
});
