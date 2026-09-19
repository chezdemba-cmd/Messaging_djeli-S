import { describe, it, expect } from "vitest";
import {
  parseAndNormalizePhone,
  detectMaliOperator,
  maskPhoneNumber,
  hashPhoneNumber,
} from "@/lib/phone";

describe("Normalisation E.164 et détection opérateur Mali", () => {
  it("normalise un numéro malien direct à 8 chiffres", () => {
    const res = parseAndNormalizePhone("70123456");
    expect(res.isValid).toBe(true);
    expect(res.e164).toBe("+22370123456");
    expect(res.countryCode).toBe("223");
    expect(res.network).toBe("ORANGE");
  });

  it("normalise un numéro malien avec indicatif +223 et espaces", () => {
    const res = parseAndNormalizePhone("+223 66 12 34 56");
    expect(res.isValid).toBe(true);
    expect(res.e164).toBe("+22366123456");
    expect(res.countryCode).toBe("223");
    expect(res.network).toBe("MOOV");
  });

  it("détecte correctement l'opérateur Telecel pour les préfixes 5x", () => {
    const res = parseAndNormalizePhone("+223 50 11 22 33");
    expect(res.isValid).toBe(true);
    expect(res.network).toBe("TELECEL");
  });

  it("gère le préfixe international avec double zéro 00223", () => {
    const res = parseAndNormalizePhone("0022376543210");
    expect(res.isValid).toBe(true);
    expect(res.e164).toBe("+22376543210");
  });

  it("rejette les numéros non valides", () => {
    expect(parseAndNormalizePhone("123").isValid).toBe(false);
    expect(parseAndNormalizePhone("abc").isValid).toBe(false);
    expect(parseAndNormalizePhone("").isValid).toBe(false);
  });

  it("masque correctement les numéros maliens pour la confidentialité", () => {
    const masked = maskPhoneNumber("+22370123456");
    expect(masked).toBe("+223 70 •• •• 56");
    expect(masked).not.toContain("1234");
  });

  it("calcule un hachage SHA-256 déterministe pour l'opt-out", () => {
    const hash1 = hashPhoneNumber("+22370123456");
    const hash2 = hashPhoneNumber("+22370123456");
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
  });
});
