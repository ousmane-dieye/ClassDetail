import { describe, it, expect } from "vitest";
import { checkRateLimit } from "@/lib/security/rateLimit";

// ---------------------------------------------------------------------------
// Tests S9 — checkRateLimit (backend distribué Supabase).
//  Le store simulé réplique EXACTEMENT la sémantique de la fonction SQL
//  `check_ai_rate_limit` (fenêtre fixe + incrément atomique) : c'est le
//  double de test de l'infrastructure Postgres partagée. Deux "clients"
//  partageant le même store représentent deux instances serverless qui
//  pointent vers la même base.
// ---------------------------------------------------------------------------

type Store = Map<string, { windowStart: number; count: number }>;

function createEnv() {
  const store: Store = new Map();
  let now = 1_700_000_000_000;
  let fail = false;
  const calls: { key: string; limit: number; windowSeconds: number }[] = [];

  const rpc = async (fn: string, args: { p_bucket_key: string; p_limit: number; p_window_seconds: number }) => {
    calls.push({ key: args.p_bucket_key, limit: args.p_limit, windowSeconds: args.p_window_seconds });
    if (fail) return { data: null, error: { message: "RPC indisponible" } };
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

  const client = () => ({ rpc }) as unknown as Parameters<typeof checkRateLimit>[0];

  return {
    store,
    calls,
    client,
    advance: (ms: number) => {
      now += ms;
    },
    setFail: (v: boolean) => {
      fail = v;
    },
  };
}

const KEY = "assistant:u-1";

describe("S9 — checkRateLimit (backend distribué Supabase)", () => {
  it("sous la limite : autorisé", async () => {
    const env = createEnv();
    for (let i = 1; i <= 4; i++) {
      const r = await checkRateLimit(env.client(), KEY, 5, 60_000);
      expect(r.allowed, `requête ${i}`).toBe(true);
    }
  });

  it("exactement la limite : autorisé (5e requête)", async () => {
    const env = createEnv();
    for (let i = 1; i <= 5; i++) {
      const r = await checkRateLimit(env.client(), KEY, 5, 60_000);
      expect(r.allowed, `requête ${i}`).toBe(true);
    }
  });

  it("dépassement : refusé avec retryAfterMs > 0, toujours refusé dans la fenêtre", async () => {
    const env = createEnv();
    for (let i = 1; i <= 5; i++) await checkRateLimit(env.client(), KEY, 5, 60_000);
    const r = await checkRateLimit(env.client(), KEY, 5, 60_000);
    expect(r.allowed).toBe(false);
    expect(r.retryAfterMs).toBeGreaterThan(0);
    expect(r.unavailable).toBeUndefined();
    const r2 = await checkRateLimit(env.client(), KEY, 5, 60_000);
    expect(r2.allowed).toBe(false);
  });

  it("expiration de fenêtre : compteur remis à zéro", async () => {
    const env = createEnv();
    for (let i = 1; i <= 5; i++) await checkRateLimit(env.client(), KEY, 5, 1_000);
    expect((await checkRateLimit(env.client(), KEY, 5, 1_000)).allowed).toBe(false);
    env.advance(1_000);
    expect((await checkRateLimit(env.client(), KEY, 5, 1_000)).allowed).toBe(true);
  });

  it("deux utilisateurs : compteurs indépendants", async () => {
    const env = createEnv();
    for (let i = 1; i <= 5; i++) await checkRateLimit(env.client(), KEY, 5, 60_000);
    expect((await checkRateLimit(env.client(), KEY, 5, 60_000)).allowed).toBe(false);
    expect((await checkRateLimit(env.client(), "assistant:u-2", 5, 60_000)).allowed).toBe(true);
  });

  it("plusieurs instances : compteurs PARTAGÉS (même store = même Postgres)", async () => {
    const env = createEnv();
    const instance1 = env.client();
    const instance2 = env.client();
    for (let i = 1; i <= 5; i++) await checkRateLimit(instance1, KEY, 5, 60_000);
    const viaInstance2 = await checkRateLimit(instance2, KEY, 5, 60_000);
    expect(viaInstance2.allowed).toBe(false);
  });

  it("RPC en échec (infrastructure) : FAIL-CLOSED — refusé + unavailable", async () => {
    const env = createEnv();
    env.setFail(true);
    const r = await checkRateLimit(env.client(), KEY, 5, 60_000);
    expect(r.allowed).toBe(false);
    expect(r.unavailable).toBe(true);
    expect(r.retryAfterMs).toBeGreaterThan(0);
  });

  it("clé/limite/fenêtre transmises à la RPC (fenêtre arrondie en secondes)", async () => {
    const env = createEnv();
    await checkRateLimit(env.client(), "assistant:d:u-1", 100, 86_400_000);
    expect(env.calls[0]).toEqual({ key: "assistant:d:u-1", limit: 100, windowSeconds: 86_400 });
  });
});
