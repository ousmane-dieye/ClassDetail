import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Tests S9 — /api/assistant : rate limiting distribué (Supabase partagé).
//  - chaque requête crée un NOUVEAU client (= une "instance" serverless)
//    mais TOUS partagent le même store simulé (= la même table Postgres).
//  - refus propre : 400 + Retry-After, short-circuit avant tout accès base.
//  - fail-closed si la RPC est indisponible.
// ---------------------------------------------------------------------------

const state = vi.hoisted(() => ({
  user: null as { id: string } | null,
  now: 1_700_000_000_000,
  rpcFail: false,
  store: new Map<string, { windowStart: number; count: number }>(),
  rpcCalls: [] as { key: string; limit: number; windowSeconds: number }[],
  fromCalls: [] as string[],
  profile: null as {
    first_name: string;
    last_name: string;
    role: string;
    class_id: string | null;
    classes?: { name: string } | null;
  } | null,
  createdChatId: "11111111-1111-4111-8111-111111111111",
  createdUserMsgId: "msg-user-1",
  createdAssistantMsgId: "msg-assistant-1",
  historyRows: [] as { role: string; content: string }[],
}));

function seed(key: string, count: number, windowSeconds: number) {
  const windowMs = windowSeconds * 1000;
  state.store.set(key, { windowStart: Math.floor(state.now / windowMs) * windowMs, count });
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => {
    const rpc = async (
      fn: string,
      args: { p_bucket_key: string; p_limit: number; p_window_seconds: number }
    ) => {
      state.rpcCalls.push({ key: args.p_bucket_key, limit: args.p_limit, windowSeconds: args.p_window_seconds });
      if (state.rpcFail) return { data: null, error: { message: "RPC indisponible" } };
      const windowMs = args.p_window_seconds * 1000;
      const windowStart = Math.floor(state.now / windowMs) * windowMs;
      let rec = state.store.get(args.p_bucket_key);
      if (!rec || rec.windowStart !== windowStart) {
        rec = { windowStart, count: 0 };
        state.store.set(args.p_bucket_key, rec);
      }
      rec.count += 1;
      const allowed = rec.count <= args.p_limit;
      const elapsed = Math.floor((state.now - windowStart) / 1000);
      const retry = allowed ? 0 : Math.max(1, args.p_window_seconds - Math.max(0, elapsed));
      return { data: { allowed, retry_after_seconds: retry }, error: null };
    };

    const from = (table: string) => {
      state.fromCalls.push(table);
      let inserted = false;
      let updated = false;
      let payload: { role?: string } | null = null;
      const chain: Record<string, unknown> = {
        insert: (p: { role?: string }) => {
          inserted = true;
          updated = false;
          payload = p;
          return chain;
        },
        update: (p: { role?: string }) => {
          updated = true;
          inserted = false;
          payload = p;
          return chain;
        },
        select: () => chain,
        eq: () => chain,
        neq: () => chain,
        order: () => chain,
        limit: () => chain,
        single: async () => {
          if (table === "profiles") return { data: state.profile, error: null };
          if (table === "assistant_chats") {
            if (inserted) return { data: { id: state.createdChatId }, error: null };
            return { data: null, error: null };
          }
          if (table === "assistant_messages") {
            if (inserted) {
              return {
                data: {
                  id: payload?.role === "assistant" ? state.createdAssistantMsgId : state.createdUserMsgId,
                },
                error: null,
              };
            }
            return { data: state.historyRows, error: null };
          }
          return { data: null, error: null };
        },
      };
      (chain as { then: unknown }).then = (
        resolve: (v: unknown) => void,
        reject?: (e: unknown) => void
      ) => Promise.resolve({ data: null, error: null }).then(resolve, reject);
      return chain;
    };

    return {
      auth: { getUser: async () => ({ data: { user: state.user }, error: null }) },
      rpc,
      from,
    };
  },
}));

vi.mock("next/server", () => ({
  NextRequest: class {
    constructor(public url: string) {}
  },
}));

vi.mock("@/lib/ai/openai", () => ({
  buildSystemPrompt: () => "SYSTEM",
  generateAssistantReply: async () => ({
    content: "Réponse de test",
    actions: [{ label: "Mes devoirs", href: "/dashboard/tasks" }],
    degraded: false,
  }),
}));

vi.mock("@/lib/ai/guard", () => ({
  checkTopicGuard: () => null,
}));

import { POST } from "@/app/api/assistant/route";
import type { NextRequest } from "next/server";

const request = (body: Record<string, unknown>) =>
  ({ json: async () => body }) as unknown as NextRequest;

const streamText = async (res: Response): Promise<string> => new Response(res.body).text();

const BODY = { chatId: "11111111-1111-4111-8111-111111111111", content: "Quelle est la date du prochain devoir ?" };

beforeEach(() => {
  state.user = { id: "u-1" };
  state.now = 1_700_000_000_000;
  state.rpcFail = false;
  state.store.clear();
  state.rpcCalls = [];
  state.fromCalls = [];
  state.profile = {
    first_name: "Awa",
    last_name: "Diop",
    role: "STUDENT",
    class_id: "c1",
    classes: { name: "Classe A" },
  };
  state.historyRows = [];
});

describe("S9 — /api/assistant : rate limiting distribué", () => {
  it("non authentifié : 401, aucune RPC appelée", async () => {
    state.user = null;
    const res = await POST(request(BODY));
    expect(res.status).toBe(401);
    expect(state.rpcCalls).toHaveLength(0);
    expect(state.fromCalls).toHaveLength(0);
  });

  it("sous la limite : accepté (200 SSE)", async () => {
    const res = await POST(request(BODY));
    expect(res.status).toBe(200);
    const text = await streamText(res);
    expect(text).toContain("done");
    expect(text).toContain("Réponse de test");
    expect(state.rpcCalls.map((c) => c.key)).toEqual(["assistant:u-1", "assistant:m:u-1", "assistant:d:u-1"]);
  });

  it("dépassement limite horaire (60) : 400 + Retry-After, short-circuit avant la base", async () => {
    seed("assistant:u-1", 60, 3600);
    const res = await POST(request(BODY));
    expect(res.status).toBe(400);
    expect(res.headers.get("Retry-After")).toMatch(/^\d+$/);
    const body = await res.json();
    expect(body.error).toContain("Limite de messages IA");
    expect(state.rpcCalls).toHaveLength(1);
    expect(state.fromCalls).toHaveLength(0);
  });

  it("dépassement limite minute (10) : 400 + Retry-After", async () => {
    seed("assistant:m:u-1", 10, 60);
    const res = await POST(request(BODY));
    expect(res.status).toBe(400);
    expect(res.headers.get("Retry-After")).toMatch(/^\d+$/);
    const body = await res.json();
    expect(body.error).toContain("patientez");
    expect(state.rpcCalls).toHaveLength(2);
    expect(state.fromCalls).toHaveLength(0);
  });

  it("dépassement limite quotidienne (100) : 400 + Retry-After", async () => {
    seed("assistant:d:u-1", 100, 86400);
    const res = await POST(request(BODY));
    expect(res.status).toBe(400);
    expect(res.headers.get("Retry-After")).toMatch(/^\d+$/);
    const body = await res.json();
    expect(body.error).toContain("questions par jour");
    expect(state.rpcCalls).toHaveLength(3);
    expect(state.fromCalls).toHaveLength(0);
  });

  it("deux utilisateurs : u-1 bloqué, u-2 encore autorisé", async () => {
    seed("assistant:d:u-1", 100, 86400);
    const blocked = await POST(request(BODY));
    expect(blocked.status).toBe(400);

    state.user = { id: "u-2" };
    const allowed = await POST(request(BODY));
    expect(allowed.status).toBe(200);
    expect(await streamText(allowed)).toContain("done");
  });

  it("plusieurs instances : les compteurs sont partagés entre clients successifs", async () => {
    seed("assistant:d:u-1", 100, 86400);
    const first = await POST(request(BODY));
    expect(first.status).toBe(400);

    const second = await POST(request(BODY));
    expect(second.status).toBe(400);
    expect(state.rpcCalls.filter((c) => c.key === "assistant:d:u-1")).toHaveLength(2);
  });

  it("RPC indisponible (infrastructure) : fail-closed — 400 sans accès base", async () => {
    state.rpcFail = true;
    const res = await POST(request(BODY));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Service de sécurité");
    expect(state.fromCalls).toHaveLength(0);
  });
});
