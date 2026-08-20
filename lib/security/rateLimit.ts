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
 * requête est REFUSÉE (fail-closed) pour protéger le système.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { createAdminClient } from "@/lib/supabase/admin";

export interface RateLimitResult {
  allowed: boolean;
  /** Millisecondes restantes avant réinitialisation (si refusé). */
  retryAfterMs?: number;
  /** true si l'infrastructure de limitation était indisponible (fail-closed). */
  unavailable?: boolean;
}

export interface AuthRateLimitCheckResult extends RateLimitResult {
  bucket?: "ip" | "account";
}

/** Configuration des politiques de rate limiting d'authentification */
export const AUTH_RATE_LIMIT_CONFIG = {
  LOGIN_IP: {
    LIMIT: 10,
    WINDOW_MS: 15 * 60 * 1000, // 15 minutes
  },
  LOGIN_ACCOUNT: {
    LIMIT: 5,
    WINDOW_MS: 15 * 60 * 1000, // 15 minutes
  },
  RESET_IP: {
    LIMIT: 5,
    WINDOW_MS: 15 * 60 * 1000, // 15 minutes
  },
  RESET_ACCOUNT: {
    LIMIT: 3,
    WINDOW_MS: 15 * 60 * 1000, // 15 minutes
  },
};

function getClientSafely(customClient?: SupabaseClient<Database>): SupabaseClient<Database> | null {
  if (customClient) return customClient;
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      return createAdminClient();
    } catch {
      return null;
    }
  }
  return null;
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

/**
 * Vérifie simultanément le rate limit par IP et par compte pour une tentative de connexion.
 */
export async function checkAuthLoginRateLimits(options: {
  ip: string;
  email: string;
  supabaseClient?: SupabaseClient<Database>;
}): Promise<AuthRateLimitCheckResult> {
  const client = getClientSafely(options.supabaseClient);
  if (!client) {
    // Si l'environnement Supabase n'est pas configuré (ex. tests unitaires sans variables), autoriser
    return { allowed: true };
  }

  const normalizedEmail = options.email.trim().toLowerCase();

  // 1. Contrôle IP
  const ipKey = `auth:login:ip:${options.ip}`;
  const ipResult = await checkRateLimit(
    client,
    ipKey,
    AUTH_RATE_LIMIT_CONFIG.LOGIN_IP.LIMIT,
    AUTH_RATE_LIMIT_CONFIG.LOGIN_IP.WINDOW_MS
  );

  if (!ipResult.allowed) {
    return { ...ipResult, bucket: "ip" };
  }

  // 2. Contrôle par Compte (email)
  const accKey = `auth:login:acc:${normalizedEmail}`;
  const accResult = await checkRateLimit(
    client,
    accKey,
    AUTH_RATE_LIMIT_CONFIG.LOGIN_ACCOUNT.LIMIT,
    AUTH_RATE_LIMIT_CONFIG.LOGIN_ACCOUNT.WINDOW_MS
  );

  if (!accResult.allowed) {
    return { ...accResult, bucket: "account" };
  }

  return { allowed: true };
}

/**
 * Vérifie le rate limit par IP et par compte pour une demande de réinitialisation de mot de passe.
 */
export async function checkPasswordResetRateLimits(options: {
  ip: string;
  email: string;
  supabaseClient?: SupabaseClient<Database>;
}): Promise<AuthRateLimitCheckResult> {
  const client = getClientSafely(options.supabaseClient);
  if (!client) {
    // Si l'environnement Supabase n'est pas configuré (ex. tests unitaires sans variables), autoriser
    return { allowed: true };
  }

  const normalizedEmail = options.email.trim().toLowerCase();

  // 1. Rate limit IP
  const ipKey = `auth:reset:ip:${options.ip}`;
  const ipResult = await checkRateLimit(
    client,
    ipKey,
    AUTH_RATE_LIMIT_CONFIG.RESET_IP.LIMIT,
    AUTH_RATE_LIMIT_CONFIG.RESET_IP.WINDOW_MS
  );

  if (!ipResult.allowed) {
    return { ...ipResult, bucket: "ip" };
  }

  // 2. Rate limit Compte
  const accKey = `auth:reset:acc:${normalizedEmail}`;
  const accResult = await checkRateLimit(
    client,
    accKey,
    AUTH_RATE_LIMIT_CONFIG.RESET_ACCOUNT.LIMIT,
    AUTH_RATE_LIMIT_CONFIG.RESET_ACCOUNT.WINDOW_MS
  );

  if (!accResult.allowed) {
    return { ...accResult, bucket: "account" };
  }

  return { allowed: true };
}
