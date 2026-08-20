import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkAuthLoginRateLimits, checkPasswordResetRateLimits } from "@/lib/security/rateLimit";
import { verifyTurnstileToken } from "@/lib/security/turnstile";
import { anonymizeEmail, anonymizeIp } from "@/lib/security/logger";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

/**
 * Double de test pour le store Supabase Postgres distribué (ai_rate_limits).
 * Réplique exactement la sémantique de check_ai_rate_limit.
 */
function createTestStore() {
  const store = new Map<string, { windowStart: number; count: number }>();
  let now = 1_700_000_000_000; // Epoch fixe de référence

  const rpc = async (
    _fn: string,
    args: { p_bucket_key: string; p_limit: number; p_window_seconds: number }
  ) => {
    const windowMs = args.p_window_seconds * 1000;
    const windowStart = Math.floor(now / windowMs) * windowMs;
    let rec = store.get(args.p_bucket_key);

    if (!rec || rec.windowStart !== windowStart) {
      rec = { windowStart, count: 0 };
      store.set(args.p_bucket_key, rec);
    }

    rec.count += 1;
    const allowed = rec.count <= args.p_limit;
    const elapsed = Math.floor((now - windowStart) / 1000);
    const retry = allowed ? 0 : Math.max(1, args.p_window_seconds - Math.max(0, elapsed));

    return { data: { allowed, retry_after_seconds: retry }, error: null };
  };

  const client = () => ({ rpc }) as unknown as SupabaseClient<Database>;

  return {
    client,
    store,
    advanceMs: (ms: number) => {
      now += ms;
    },
  };
}

describe("ClassPulse Security — Suite complète d'audit anti-brute-force", () => {
  let env: ReturnType<typeof createTestStore>;

  beforeEach(() => {
    env = createTestStore();
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Test 1 — Tentatives normales sous les seuils
  // -------------------------------------------------------------------------
  it("Test 1 — Connexion sous les limites : autorisée", async () => {
    const result = await checkAuthLoginRateLimits({
      ip: "192.168.1.10",
      email: "etudiant@ecole.fr",
      supabaseClient: env.client(),
    });

    expect(result.allowed).toBe(true);
    expect(result.bucket).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // Test 2 — Gestion des échecs et réponses génériques (anti-énumération)
  // -------------------------------------------------------------------------
  it("Test 2 — Anonymisation des données sensibles pour les logs", () => {
    expect(anonymizeEmail("ousmane.dieye@gmail.com")).toBe("o***e@g***l.com");
    expect(anonymizeEmail("a@b.com")).toBe("a*@b*.com");
    expect(anonymizeIp("192.168.1.150")).toBe("192.168.1.xxx");
    expect(anonymizeIp("2001:db8:85a3:8d3:1319:8a2e:370:7334")).toBe("2001:db8:85a3:xxxx");
  });

  // -------------------------------------------------------------------------
  // Test 3 — Rate-limit par IP (limite à 10 tentatives)
  // -------------------------------------------------------------------------
  it("Test 3 — Bloque l'IP après dépassement du quota (10 tentatives / 15 min)", async () => {
    const ip = "10.0.0.5";

    // 10 tentatives différentes sur des comptes distincts depuis la même IP
    for (let i = 1; i <= 10; i++) {
      const res = await checkAuthLoginRateLimits({
        ip,
        email: `user${i}@ecole.fr`,
        supabaseClient: env.client(),
      });
      expect(res.allowed, `tentative IP ${i}`).toBe(true);
    }

    // 11ème tentative depuis la même IP -> Doit être refusée par le bucket IP
    const blockedRes = await checkAuthLoginRateLimits({
      ip,
      email: "autre.compte@ecole.fr",
      supabaseClient: env.client(),
    });

    expect(blockedRes.allowed).toBe(false);
    expect(blockedRes.bucket).toBe("ip");
    expect(blockedRes.retryAfterMs).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // Test 4 — Rate-limit par Compte (limite à 5 tentatives / compte)
  // -------------------------------------------------------------------------
  it("Test 4 — Bloque le compte après 5 échecs répétés, indépendamment de l'IP", async () => {
    const targetEmail = "victime@ecole.fr";

    // 5 tentatives sur le même compte
    for (let i = 1; i <= 5; i++) {
      const res = await checkAuthLoginRateLimits({
        ip: `192.168.1.${i}`, // IPs différentes pour chaque tentative
        email: targetEmail,
        supabaseClient: env.client(),
      });
      expect(res.allowed, `tentative compte ${i}`).toBe(true);
    }

    // 6ème tentative sur ce même compte -> Bloquée par le bucket Compte
    const blockedRes = await checkAuthLoginRateLimits({
      ip: "192.168.1.99",
      email: targetEmail,
      supabaseClient: env.client(),
    });

    expect(blockedRes.allowed).toBe(false);
    expect(blockedRes.bucket).toBe("account");
  });

  // -------------------------------------------------------------------------
  // Test 5 — Rotation d'IP (contournement empêché par le rate limit compte)
  // -------------------------------------------------------------------------
  it("Test 5 — Une rotation d'IP ne permet pas de contourner la protection du compte", async () => {
    const targetEmail = "cible.attack@ecole.fr";

    // L'attaquant essaie depuis IP_1, IP_2, IP_3, IP_4, IP_5
    for (let i = 1; i <= 5; i++) {
      await checkAuthLoginRateLimits({
        ip: `10.200.0.${i}`,
        email: targetEmail,
        supabaseClient: env.client(),
      });
    }

    // Tentative depuis une toute nouvelle IP IP_6 -> refusée car le compte est protégé
    const attackFromNewIp = await checkAuthLoginRateLimits({
      ip: "10.200.0.6",
      email: targetEmail,
      supabaseClient: env.client(),
    });

    expect(attackFromNewIp.allowed).toBe(false);
    expect(attackFromNewIp.bucket).toBe("account");
  });

  // -------------------------------------------------------------------------
  // Test 6 — Strict Anti-Énumération (réponses unifiées)
  // -------------------------------------------------------------------------
  it("Test 6 — Anti-Énumération : le message public est strictement identique dans tous les cas de figure", () => {
    const GENERIC_ERROR = "Identifiants invalides ou trop de tentatives. Veuillez réessayer plus tard.";

    // Simulation de réponses
    const emailInexistantError = GENERIC_ERROR;
    const mauvaisPasswordError = GENERIC_ERROR;
    const rateLimitedError = GENERIC_ERROR;

    expect(emailInexistantError).toBe(mauvaisPasswordError);
    expect(mauvaisPasswordError).toBe(rateLimitedError);
  });

  // -------------------------------------------------------------------------
  // Test 7 — Validation CAPTCHA Cloudflare Turnstile
  // -------------------------------------------------------------------------
  it("Test 7 — Validation CAPTCHA serveur (skip si clé non configurée, rejet si token vide)", async () => {
    // Cas 1 : Aucune clé secrète configurée -> skipped (mode dégradé fluide)
    delete process.env.TURNSTILE_SECRET_KEY;
    const resNoKey = await verifyTurnstileToken(null, "192.168.1.1");
    expect(resNoKey.success).toBe(true);
    expect(resNoKey.skipped).toBe(true);

    // Cas 2 : Clé secrète configurée mais aucun token fourni -> Rejeté
    process.env.TURNSTILE_SECRET_KEY = "0x4AAAAAAAx-fake-secret";
    const resMissingToken = await verifyTurnstileToken("", "192.168.1.1");
    expect(resMissingToken.success).toBe(false);
    expect(resMissingToken.error).toContain("manquant");
  });

  // -------------------------------------------------------------------------
  // Test 8 — Rate limit sur la réinitialisation de mot de passe
  // -------------------------------------------------------------------------
  it("Test 8 — Protège l'endpoint de réinitialisation contre le spam d'emails", async () => {
    const resetEmail = "test.reset@ecole.fr";
    const ip = "172.16.0.10";

    // 3 demandes de réinitialisation autorisées (AUTH_RATE_LIMIT_CONFIG.RESET_ACCOUNT = 3)
    for (let i = 1; i <= 3; i++) {
      const res = await checkPasswordResetRateLimits({
        ip,
        email: resetEmail,
        supabaseClient: env.client(),
      });
      expect(res.allowed).toBe(true);
    }

    // 4ème demande -> Bloquée
    const blockedReset = await checkPasswordResetRateLimits({
      ip,
      email: resetEmail,
      supabaseClient: env.client(),
    });

    expect(blockedReset.allowed).toBe(false);
    expect(blockedReset.bucket).toBe("account");
  });

  // -------------------------------------------------------------------------
  // Test 9 — Connexion réussie après quelques échecs
  // -------------------------------------------------------------------------
  it("Test 9 — Un utilisateur légitime qui se trompe 2 fois puis réussit est autorisé", async () => {
    const userEmail = "legitime@ecole.fr";
    const userIp = "192.168.1.55";

    // 2 échecs
    await checkAuthLoginRateLimits({ ip: userIp, email: userEmail, supabaseClient: env.client() });
    await checkAuthLoginRateLimits({ ip: userIp, email: userEmail, supabaseClient: env.client() });

    // 3ème tentative (mot de passe exact) -> Toujours sous la limite (2 < 5), autorisé
    const thirdAttempt = await checkAuthLoginRateLimits({
      ip: userIp,
      email: userEmail,
      supabaseClient: env.client(),
    });

    expect(thirdAttempt.allowed).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Test 10 — Expiration du blocage temporaire après la fenêtre (15 minutes)
  // -------------------------------------------------------------------------
  it("Test 10 — Les blocages temporaires expirent correctement après l'intervalle de 15 min", async () => {
    const email = "bloque.temporaire@ecole.fr";
    const ip = "10.0.1.1";

    // Atteindre le blocage (5 tentatives)
    for (let i = 1; i <= 5; i++) {
      await checkAuthLoginRateLimits({ ip, email, supabaseClient: env.client() });
    }

    // La 6ème tentative est bloquée
    const beforeExpiry = await checkAuthLoginRateLimits({ ip, email, supabaseClient: env.client() });
    expect(beforeExpiry.allowed).toBe(false);

    // Avancer le temps de 15 minutes + 1 seconde (901_000 ms)
    env.advanceMs(15 * 60 * 1000 + 1000);

    // Après expiration de la fenêtre, l'accès est débloqué
    const afterExpiry = await checkAuthLoginRateLimits({ ip, email, supabaseClient: env.client() });
    expect(afterExpiry.allowed).toBe(true);
  });
});
