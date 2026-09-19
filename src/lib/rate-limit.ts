interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const memoryStore = new Map<string, RateLimitEntry>();
const otpRecipientStore = new Map<string, { count: number; resetAt: number }>();

/**
 * Limiteur de débit avec fenêtre glissante pour protéger l'API Djeli'S.
 */
export function checkRateLimit(
  key: string,
  limit: number = 60,
  windowSeconds: number = 60
): { allowed: boolean; remaining: number; resetInSeconds: number } {
  const now = Date.now();
  const entry = memoryStore.get(key);

  if (!entry || now > entry.resetAt) {
    memoryStore.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return { allowed: true, remaining: limit - 1, resetInSeconds: windowSeconds };
  }

  if (entry.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      resetInSeconds: Math.ceil((entry.resetAt - now) / 1000),
    };
  }

  entry.count += 1;
  return {
    allowed: true,
    remaining: limit - entry.count,
    resetInSeconds: Math.ceil((entry.resetAt - now) / 1000),
  };
}

/**
 * Protection stricte contre le SMS Pumping et l'abus d'OTP :
 * Maximum 3 OTP par numéro de téléphone dans une fenêtre de 10 minutes.
 */
export function checkOtpPumpingGuard(
  phoneHash: string,
  maxAttempts: number = 3,
  windowSeconds: number = 600
): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const entry = otpRecipientStore.get(phoneHash);

  if (!entry || now > entry.resetAt) {
    otpRecipientStore.set(phoneHash, { count: 1, resetAt: now + windowSeconds * 1000 });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (entry.count >= maxAttempts) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((entry.resetAt - now) / 1000),
    };
  }

  entry.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}
