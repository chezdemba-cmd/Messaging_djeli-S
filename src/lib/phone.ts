import crypto from "node:crypto";
import { PhoneDetails, NetworkCode } from "@/types/sms";

/**
 * Normalise et analyse un numéro de téléphone international avec prise en charge
 * native de l'indicatif Mali (+223) et détection heuristique des opérateurs locaux.
 */
export function parseAndNormalizePhone(rawPhone: string): PhoneDetails {
  if (!rawPhone || typeof rawPhone !== "string") {
    return {
      e164: "",
      countryCode: "",
      nationalNumber: "",
      network: "UNKNOWN",
      masked: "****",
      isValid: false,
    };
  }

  // Nettoyage : supprime les espaces, tirets, parenthèses, points
  let cleaned = rawPhone.replace(/[\s\-\(\)\.]/g, "").trim();

  // Gestion du double zéro international (ex: 00223... -> +223...)
  if (cleaned.startsWith("00")) {
    cleaned = "+" + cleaned.slice(2);
  }

  // Si commence par un numéro malien direct à 8 chiffres (ex: 70123456)
  if (/^[256789]\d{7}$/.test(cleaned)) {
    cleaned = "+223" + cleaned;
  }

  // S'assurer du préfixe '+'
  if (!cleaned.startsWith("+") && /^\d+$/.test(cleaned)) {
    cleaned = "+" + cleaned;
  }

  // Vérification de base E.164 (+ suivi de 7 à 15 chiffres)
  const e164Regex = /^\+[1-9]\d{6,14}$/;
  const isValid = e164Regex.test(cleaned);

  let countryCode = "";
  let nationalNumber = "";
  let network: NetworkCode = "UNKNOWN";

  if (isValid) {
    if (cleaned.startsWith("+223")) {
      countryCode = "223";
      nationalNumber = cleaned.slice(4); // Ex: 70123456 (8 chiffres)
      network = detectMaliOperator(nationalNumber);
    } else {
      // Détection sommaire indicatif pays (1 à 3 chiffres)
      const match = cleaned.match(/^\+(\d{1,3})(\d+)$/);
      if (match) {
        countryCode = match[1];
        nationalNumber = match[2];
      }
    }
  }

  const masked = maskPhoneNumber(cleaned);

  return {
    e164: cleaned,
    countryCode,
    nationalNumber,
    network,
    masked,
    isValid,
  };
}

/**
 * Détection heuristique des opérateurs au Mali selon le plan de numérotation ARTP :
 * - Orange Mali : commence par 7, 8 ou 9 (ex: 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 82, 83, 89, 90...)
 * - Moov Africa Malitel : commence par 6 ou 2 (ex: 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 20...)
 * - Telecel Mali : commence par 5 (ex: 50, 51, 52, 53, 54...)
 */
export function detectMaliOperator(nationalNumber: string): NetworkCode {
  if (!nationalNumber || nationalNumber.length < 2) {
    return "UNKNOWN";
  }

  const firstDigit = nationalNumber.charAt(0);

  if (["7", "8", "9"].includes(firstDigit)) {
    return "ORANGE";
  }
  if (["6", "2"].includes(firstDigit)) {
    return "MOOV";
  }
  if (firstDigit === "5") {
    return "TELECEL";
  }

  return "UNKNOWN";
}

/**
 * Masque un numéro de téléphone pour la journalisation sécurisée et le tableau de bord.
 * Ex: "+22370123456" -> "+223 70 •• •• 56"
 * Ex: "+33612345678" -> "+33 6 •••• 5678"
 */
export function maskPhoneNumber(phone: string): string {
  if (!phone || phone.length < 6) {
    return "••••";
  }

  if (phone.startsWith("+223") && phone.length === 12) {
    // +223 70 12 34 56 -> +223 70 •• •• 56
    return `+223 ${phone.slice(4, 6)} •• •• ${phone.slice(10, 12)}`;
  }

  const visibleStart = Math.min(4, Math.floor(phone.length / 3));
  const visibleEnd = Math.min(2, Math.floor(phone.length / 4));
  const maskedLength = Math.max(3, phone.length - visibleStart - visibleEnd);

  return `${phone.slice(0, visibleStart)}${"•".repeat(maskedLength)}${phone.slice(phone.length - visibleEnd)}`;
}

/**
 * Génère un hachage SHA-256 irréversible du numéro E.164
 * pour vérifier les listes d'opposition (opt-outs) et contacts sans stocker le numéro en clair.
 */
export function hashPhoneNumber(phoneE164: string): string {
  return crypto.createHash("sha256").update(phoneE164.trim()).digest("hex");
}
