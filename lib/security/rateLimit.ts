/**
 * Rate limiting distribué via Supabase (table ai_rate_limits + fonction SQL
 * atomique `check_ai_rate_limit`).
 *
 * Toutes les instances partagent le même état Postgres : le compteur ne peut
 * pas être contourné en changeant d'instance (serverless / multi-région).
 * Fenêtre FIXE : le début de fenêtre est calculé côté SQL (identique pour
 * toutes les instances), l'incrément est atomique (verrou de ligne).
 *
 * En cas d'échec d'infrastructure (fonction/table absente, réseau), la
 * requête est REFUSÉE (fail-closed) pour protéger le coût de l'API IA :
 * `unavailable: true` permet d'afficher un message distinct.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

export interface RateLimitResult {
  allowed: boolean;
  /** Millisecondes restantes avant réinitialisation (si refusé). */
  retryAfterMs?: number;
  /** true si l'infrastructure de limitation était indisponible (fail-closed). */
  unavailable?: boolean;
}

export async function checkRateLimit(
  supabase: SupabaseClient<Database>,
  key: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult> {
  const { data, error } = await supabase.rpc("check_ai_rate_limit", {
    p_bucket_key: key,
    p_limit: limit,
    p_window_seconds: Math.max(1, Math.round(windowMs / 1000)),
  });

  if (error || !data || typeof data.allowed !== "boolean") {
    console.error(`Rate limit : RPC indisponible (%s) — requête refusée (fail-closed) :`, key, error?.message);
    return { allowed: false, retryAfterMs: 60_000, unavailable: true };
  }

  return {
    allowed: data.allowed,
    retryAfterMs: data.allowed ? undefined : (data.retry_after_seconds ?? 0) * 1000,
  };
}
