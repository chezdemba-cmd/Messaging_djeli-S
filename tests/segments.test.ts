import { describe, it, expect } from "vitest";
import { calculateSmsSegments, analyzeGsmEncoding } from "@/lib/segments";

describe("Calculateur GSM-7 vs Unicode et Segments SMS", () => {
  it("détecte correctement l'alphabet standard GSM-7", () => {
    const text = "Bonjour client Djeli'S, votre commande est prete.";
    const analysis = analyzeGsmEncoding(text);
    expect(analysis.isGsm7).toBe(true);
  });

  it("compte double pour les caractères étendus GSM (ex: € ou {)", () => {
    const text = "Prix: 50 €";
    const analysis = analyzeGsmEncoding(text);
    expect(analysis.isGsm7).toBe(true);
    // 'Prix: 50 ' = 9 chars + '€' qui compte pour 2 = 11 septets
    expect(analysis.gsmLength).toBe(11);
  });

  it("bascule en UNICODE dès la présence d'un caractère hors GSM-7 (ex: emoji ou accent non supporté)", () => {
    const text = "Commande confirmée 🚀";
    const calc = calculateSmsSegments(text);
    expect(calc.encoding).toBe("UNICODE");
  });

  it("calcule 1 seul segment pour un message GSM-7 <= 160 caractères", () => {
    const text = "A".repeat(160);
    const calc = calculateSmsSegments(text);
    expect(calc.encoding).toBe("GSM-7");
    expect(calc.segmentCount).toBe(1);
    expect(calc.remainingCharactersInSegment).toBe(0);
  });

  it("calcule 2 segments pour un message GSM-7 de 161 caractères (multi-segments basé sur 153)", () => {
    const text = "A".repeat(161);
    const calc = calculateSmsSegments(text);
    expect(calc.encoding).toBe("GSM-7");
    expect(calc.segmentCount).toBe(2);
    // 2 * 153 = 306 max, 306 - 161 = 145 restants
    expect(calc.remainingCharactersInSegment).toBe(145);
  });

  it("calcule 1 seul segment pour un message Unicode <= 70 caractères", () => {
    const text = "Votre code est 1234 🔐";
    const calc = calculateSmsSegments(text);
    expect(calc.encoding).toBe("UNICODE");
    expect(calc.segmentCount).toBe(1);
  });

  it("calcule 2 segments pour un message Unicode > 70 caractères (multi-segments basé sur 67)", () => {
    const text = "Code de validation spécial : 1234567890 🌟 " + "x".repeat(50);
    const calc = calculateSmsSegments(text);
    expect(calc.encoding).toBe("UNICODE");
    expect(calc.segmentCount).toBe(2);
  });
});
