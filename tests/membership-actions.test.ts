import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Tests — Paramètres → Ma classe : Server Actions d'appartenance
// (leaveClassAction / requestClassTransferAction / cancelClassRequestAction).
//
// Clients Supabase et next/cache simulés : on vérifie la LOGIQUE de chaque
// action (session, validation, mapping des codes retour de la base) et le fait
// qu'aucun identifiant d'utilisateur n'est jamais accepté depuis le client.
// Les garanties d'atomicité (verrouillage, index unique, ré-vérification des
// conditions à l'écriture) vivent dans la migration 0019 — non testables sans
// base de données réelle.
// ---------------------------------------------------------------------------

const state = vi.hoisted(() => ({
  user: null as { id: string } | null,
  rpcResult: { status: "ok" } as Record<string, unknown> | null,
  rpcError: null as { message: string } | null,
  rpcCalls: [] as Array<{ fn: string; args: Record<string, unknown> }>,
  revalidated: [] as string[],
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    auth: {
      getUser: () => Promise.resolve({ data: { user: state.user }, error: null }),
    },
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: (fn: string, args: Record<string, unknown>) => {
      state.rpcCalls.push({ fn, args });
      return Promise.resolve({ data: state.rpcResult, error: state.rpcError });
    },
  }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => {
    state.revalidated.push(path);
  },
}));

import {
  cancelClassRequestAction,
  leaveClassAction,
  requestClassTransferAction,
} from "@/actions/membership";

const CLASS_ID = "33333333-3333-3333-3333-333333333333";
const REQUEST_ID = "44444444-4444-4444-4444-444444444444";

function form(classId: string) {
  const fd = new FormData();
  fd.set("classId", classId);
  return fd;
}

beforeEach(() => {
  state.user = { id: "u-1" };
  state.rpcResult = { status: "ok" };
  state.rpcError = null;
  state.rpcCalls = [];
  state.revalidated = [];
});

describe("leaveClassAction — quitter sa classe", () => {
  it("appelle la fonction SQL avec l'identité relevée côté serveur (jamais un id client)", async () => {
    const res = await leaveClassAction();
    expect(res).toEqual({ success: true });
    expect(state.rpcCalls).toHaveLength(1);
    expect(state.rpcCalls[0]!.fn).toBe("classpulse_leave_class");
    expect(state.rpcCalls[0]!.args).toEqual({ p_user_id: "u-1" });
    expect(state.revalidated).toContain("/dashboard");
    expect(state.revalidated).toContain("/dashboard/settings/class");
  });

  it("utilisateur non authentifié → refus, aucune écriture", async () => {
    state.user = null;
    const res = await leaveClassAction();
    expect(res).toEqual({ error: expect.stringContaining("connecté") });
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("refus de la base (délégué) → message explicite de révocation préalable", async () => {
    state.rpcResult = { status: "error", code: "DELEGATE_BLOCKED" };
    const res = await leaveClassAction();
    expect(res).toEqual({ error: expect.stringContaining("révoquer") });
    expect(state.revalidated).toHaveLength(0);
  });

  it("refus de la base (administrateur) → message explicite", async () => {
    state.rpcResult = { status: "error", code: "ADMIN_BLOCKED" };
    const res = await leaveClassAction();
    expect(res).toEqual({ error: expect.stringContaining("administrateur") });
  });

  it("refus de la base (déjà sans classe) → message explicite", async () => {
    state.rpcResult = { status: "error", code: "NO_CLASS" };
    const res = await leaveClassAction();
    expect(res).toEqual({ error: expect.stringContaining("aucune classe") });
  });

  it("code retour inconnu → message générique, jamais un succès", async () => {
    state.rpcResult = { status: "error", code: "WHATEVER" };
    const res = await leaveClassAction();
    expect(res).not.toEqual({ success: true });
    expect(res).toHaveProperty("error");
  });

  it("erreur de base → message d'échec transmis, aucun succès", async () => {
    state.rpcError = { message: "server unavailable" };
    const res = await leaveClassAction();
    expect(res).toEqual({ error: expect.stringContaining("server unavailable") });
    expect(state.revalidated).toHaveLength(0);
  });

  it("réponse absente de la base → refus (pas de succès implicite)", async () => {
    state.rpcResult = null;
    const res = await leaveClassAction();
    expect(res).not.toEqual({ success: true });
  });

  it("double soumission : chaque appel repart de la session et relit la base", async () => {
    await leaveClassAction();
    // Deuxième appel : la base refuse (l'utilisateur n'a plus de classe).
    state.rpcResult = { status: "error", code: "NO_CLASS" };
    const res = await leaveClassAction();
    expect(res).toEqual({ error: expect.stringContaining("aucune classe") });
    expect(state.rpcCalls).toHaveLength(2);
    expect(state.rpcCalls.every((c) => c.args.p_user_id === "u-1")).toBe(true);
  });
});

describe("requestClassTransferAction — rejoindre / changer de classe", () => {
  it("demande valide → PENDING côté base, identité de session", async () => {
    const res = await requestClassTransferAction(form(CLASS_ID));
    expect(res).toEqual({ success: true });
    expect(state.rpcCalls[0]).toEqual({
      fn: "classpulse_request_class_change",
      args: { p_user_id: "u-1", p_target_class_id: CLASS_ID },
    });
    expect(state.revalidated).toContain("/dashboard/settings/class");
  });

  it("classe absente → validation zod, aucune écriture", async () => {
    const res = await requestClassTransferAction(form(""));
    expect(res).toEqual({ error: expect.stringContaining("classe") });
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("classe non uuid → validation zod, aucune écriture", async () => {
    const res = await requestClassTransferAction(form("pas-un-uuid"));
    expect(res).toHaveProperty("error");
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("non connecté → refus, aucune écriture", async () => {
    state.user = null;
    const res = await requestClassTransferAction(form(CLASS_ID));
    expect(res).toEqual({ error: expect.stringContaining("connecté") });
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("demande déjà en attente (double soumission) → refus explicite", async () => {
    state.rpcResult = { status: "error", code: "PENDING_EXISTS" };
    const res = await requestClassTransferAction(form(CLASS_ID));
    expect(res).toEqual({ error: expect.stringContaining("déjà en attente") });
  });

  it("déjà membre de la classe visée → refus explicite", async () => {
    state.rpcResult = { status: "error", code: "SAME_CLASS" };
    const res = await requestClassTransferAction(form(CLASS_ID));
    expect(res).toEqual({ error: expect.stringContaining("déjà") });
  });

  it("rôle non étudiant (délégué) → refus explicite de révocation préalable", async () => {
    state.rpcResult = { status: "error", code: "ROLE_BLOCKED" };
    const res = await requestClassTransferAction(form(CLASS_ID));
    expect(res).toEqual({ error: expect.stringContaining("révoquer") });
  });

  it("classe inexistante → refus explicite", async () => {
    state.rpcResult = { status: "error", code: "CLASS_NOT_FOUND" };
    const res = await requestClassTransferAction(form(CLASS_ID));
    expect(res).toEqual({ error: expect.stringContaining("n'existe pas") });
  });

  it("erreur de base → échec signalé, aucun succès", async () => {
    state.rpcError = { message: "timeout" };
    const res = await requestClassTransferAction(form(CLASS_ID));
    expect(res).toEqual({ error: expect.stringContaining("timeout") });
    expect(state.revalidated).toHaveLength(0);
  });
});

describe("cancelClassRequestAction — annuler sa demande", () => {
  it("demande valide → annulation par l'identité de session", async () => {
    const res = await cancelClassRequestAction(REQUEST_ID);
    expect(res).toEqual({ success: true });
    expect(state.rpcCalls[0]).toEqual({
      fn: "classpulse_cancel_request",
      args: { p_user_id: "u-1", p_request_id: REQUEST_ID },
    });
  });

  it("identifiant vide → refus, aucune écriture", async () => {
    const res = await cancelClassRequestAction("");
    expect(res).toHaveProperty("error");
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("non connecté → refus, aucune écriture", async () => {
    state.user = null;
    const res = await cancelClassRequestAction(REQUEST_ID);
    expect(res).toEqual({ error: expect.stringContaining("connecté") });
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("demande d'un autre utilisateur (NOT_FOUND) → refus identique à « inexistante »", async () => {
    state.rpcResult = { status: "error", code: "NOT_FOUND" };
    const res = await cancelClassRequestAction(REQUEST_ID);
    expect(res).toEqual({ error: expect.stringContaining("introuvable") });
    expect(state.revalidated).toHaveLength(0);
  });

  it("demande déjà tranchée → refus explicite", async () => {
    state.rpcResult = { status: "error", code: "NOT_PENDING" };
    const res = await cancelClassRequestAction(REQUEST_ID);
    expect(res).toEqual({ error: expect.stringContaining("déjà été traitée") });
  });

  it("erreur de base → échec signalé", async () => {
    state.rpcError = { message: "connection reset" };
    const res = await cancelClassRequestAction(REQUEST_ID);
    expect(res).toEqual({ error: expect.stringContaining("connection reset") });
  });
});
