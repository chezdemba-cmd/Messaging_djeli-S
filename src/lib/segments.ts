import { SegmentCalculation } from "@/types/sms";

// GSM 7-bit basic character set
const GSM7_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ\x1BÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";

// GSM 7-bit extension characters (each counts as 2 characters in GSM-7)
const GSM7_EXTENDED = "|^€{}[]~\\";

/**
 * Détermine si une chaîne est entièrement encodable en GSM-7 (avec ou sans extension).
 * Renvoie également le décompte total en équivalents septets (car les caractères étendus comptent pour 2).
 */
export function analyzeGsmEncoding(text: string): { isGsm7: boolean; gsmLength: number } {
  let gsmLength = 0;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (GSM7_BASIC.includes(char)) {
      gsmLength += 1;
    } else if (GSM7_EXTENDED.includes(char)) {
      gsmLength += 2; // Compte double dans la norme GSM 03.38
    } else {
      return { isGsm7: false, gsmLength: 0 };
    }
  }

  return { isGsm7: true, gsmLength };
}

/**
 * Calcule avec exactitude le nombre de segments SMS nécessaires,
 * l'encodage retenu (GSM-7 vs Unicode/UCS-2) et les caractères restants.
 *
 * Règles standard :
 * - GSM-7 mono-segment : jusqu'à 160 caractères
 * - GSM-7 multi-segments : 153 caractères par segment (7 caractères réservés pour l'en-tête UDH)
 * - Unicode mono-segment : jusqu'à 70 caractères
 * - Unicode multi-segments : 67 caractères par segment (3 caractères réservés pour l'en-tête UDH)
 */
export function calculateSmsSegments(message: string): SegmentCalculation {
  if (!message || message.length === 0) {
    return {
      encoding: "GSM-7",
      characterCount: 0,
      segmentCount: 1,
      maxCharactersPerSegment: 160,
      remainingCharactersInSegment: 160,
    };
  }

  const { isGsm7, gsmLength } = analyzeGsmEncoding(message);

  if (isGsm7) {
    const singleMax = 160;
    const multiMax = 153;

    if (gsmLength <= singleMax) {
      return {
        encoding: "GSM-7",
        characterCount: gsmLength,
        segmentCount: 1,
        maxCharactersPerSegment: singleMax,
        remainingCharactersInSegment: singleMax - gsmLength,
      };
    } else {
      const segmentCount = Math.ceil(gsmLength / multiMax);
      const remaining = segmentCount * multiMax - gsmLength;
      return {
        encoding: "GSM-7",
        characterCount: gsmLength,
        segmentCount,
        maxCharactersPerSegment: multiMax,
        remainingCharactersInSegment: remaining,
      };
    }
  } else {
    // UCS-2 / Unicode
    // Attention aux paires de substitution (surrogate pairs / emojis) :
    // Chaque point de code hors BMP prend 2 unités UTF-16 mais compte pour 2 caractères UCS-2
    const ucs2Length = Array.from(message).reduce((acc, char) => {
      // Les caractères de plus de 16 bits comptent pour 2 code units UCS-2
      return acc + (char.codePointAt(0)! > 0xffff ? 2 : 1);
    }, 0);

    const singleMax = 70;
    const multiMax = 67;

    if (ucs2Length <= singleMax) {
      return {
        encoding: "UNICODE",
        characterCount: ucs2Length,
        segmentCount: 1,
        maxCharactersPerSegment: singleMax,
        remainingCharactersInSegment: singleMax - ucs2Length,
      };
    } else {
      const segmentCount = Math.ceil(ucs2Length / multiMax);
      const remaining = segmentCount * multiMax - ucs2Length;
      return {
        encoding: "UNICODE",
        characterCount: ucs2Length,
        segmentCount,
        maxCharactersPerSegment: multiMax,
        remainingCharactersInSegment: remaining,
      };
    }
  }
}
