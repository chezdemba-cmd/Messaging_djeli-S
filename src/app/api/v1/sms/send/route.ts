import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/db";
import { sendSmsRequestSchema } from "@/lib/schemas";
import { SmsService } from "@/lib/sms-service";
import { checkRateLimit } from "@/lib/rate-limit";

const smsService = new SmsService();

export async function POST(request: NextRequest) {
  try {
    // 1. Extraction et validation de l'en-tête Authorization
    const authHeader = request.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json(
        {
          success: false,
          errorCode: "UNAUTHORIZED",
          errorMessage: "En-tête Authorization Bearer manquant ou invalide.",
        },
        { status: 401 }
      );
    }

    const apiKey = authHeader.replace("Bearer ", "").trim();
    const app = await authenticateApiKey(apiKey);

    if (!app) {
      return NextResponse.json(
        {
          success: false,
          errorCode: "INVALID_API_KEY",
          errorMessage: "Clé API invalide, révoquée ou expirée.",
        },
        { status: 401 }
      );
    }

    if (app.status !== "active") {
      return NextResponse.json(
        {
          success: false,
          errorCode: "APPLICATION_SUSPENDED",
          errorMessage: `L'application '${app.name}' est suspendue.`,
        },
        { status: 403 }
      );
    }

    // 2. Extraction et validation de l'en-tête Idempotency-Key
    const idempotencyKey = request.headers.get("idempotency-key");
    if (!idempotencyKey || idempotencyKey.trim().length < 4) {
      return NextResponse.json(
        {
          success: false,
          errorCode: "MISSING_IDEMPOTENCY_KEY",
          errorMessage: "L'en-tête 'Idempotency-Key' est requis (minimum 4 caractères).",
        },
        { status: 400 }
      );
    }

    // 3. Limitation du débit globale par application (60 req/min par défaut)
    const rateCheck = checkRateLimit(`app:${app.id}`, 120, 60);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        {
          success: false,
          errorCode: "RATE_LIMIT_EXCEEDED",
          errorMessage: `Limite de requêtes atteinte pour '${app.name}'. Réessayez dans ${rateCheck.resetInSeconds}s.`,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(rateCheck.resetInSeconds),
          },
        }
      );
    }

    // 4. Parsing et validation du corps de la requête
    let bodyJson: unknown;
    try {
      bodyJson = await request.json();
    } catch {
      return NextResponse.json(
        {
          success: false,
          errorCode: "INVALID_JSON",
          errorMessage: "Le corps de la requête doit être un objet JSON valide.",
        },
        { status: 400 }
      );
    }

    const parseResult = sendSmsRequestSchema.safeParse(bodyJson);
    if (!parseResult.success) {
      return NextResponse.json(
        {
          success: false,
          errorCode: "VALIDATION_ERROR",
          errorMessage: parseResult.error.errors.map((e) => e.message).join(", "),
        },
        { status: 400 }
      );
    }

    // 5. Traitement via le service SMS
    const result = await smsService.processSms(
      app,
      parseResult.data,
      idempotencyKey.trim()
    );

    const httpStatus = result.success ? (result.duplicate ? 200 : 201) : 400;

    return NextResponse.json(
      {
        success: result.success,
        messageId: result.messageId,
        status: result.status,
        provider: result.provider,
        segments: result.segments,
        estimatedCostFcfa: result.estimatedCostFcfa,
        ...(result.duplicate ? { duplicate: true } : {}),
        ...(result.errorCode ? { errorCode: result.errorCode } : {}),
        ...(result.errorMessage ? { errorMessage: result.errorMessage } : {}),
      },
      { status: httpStatus }
    );
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Erreur interne";
    return NextResponse.json(
      {
        success: false,
        errorCode: "INTERNAL_SERVER_ERROR",
        errorMessage: "Une erreur inattendue est survenue.",
        details: process.env.NODE_ENV === "development" ? errorMsg : undefined,
      },
      { status: 500 }
    );
  }
}
