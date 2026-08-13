/**
 * Rate limiting simple en mémoire (fenêtre glissante par clé).
 *
 * ⚠️ Limite : fonctionne sur une instance unique. Pour un déploiement multi-régions,
 * remplacer par une implémentation Redis/Upstash (même interface).
 * Utilisé pour : messages, assistant IA.
 */

const buckets = new Map<string, { count: number; resetAt: number }>();

export interface RateLimitResult {
  allowed: boolean;
  /** Millisecondes restantes avant réinitialisation (si refusé). */
  retryAfterMs?: number;
}

export function checkRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true };
  }

  if (bucket.count >= limit) {
    return { allowed: false, retryAfterMs: bucket.resetAt - now };
  }

  bucket.count += 1;
  return { allowed: true };
}

/** Nettoie l'état (tests / restart). */
export function clearRateLimits(): void {
  buckets.clear();
}
