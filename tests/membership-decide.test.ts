import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Tests — decideRegistrationAction (workflow d'approbation réutilisé par le
// changement de classe) : session, contrôle d'autorisation, transition
// atomique via classpulse_decide_request, puis effets de bord (notification /
// email) déclenchés UNIQUEMENT si la base a confirmé la transition.
//
// Correction couverte : P-020 (un demandeur ne peut plus s'auto-accepter) et
// P-021 (aucune suite service role si aucune ligne n'a été modifiée).
// ---------------------------------------------------------------------------

const state = vi.hoisted(() => ({
  user: null as { id: string } | null,
  actor: null as { role: string; class_id: string | null } | null,
  request: null as Record<string, any> | null,
  studentEmail: "etudiant@example.com" as string | null,
  rpcResult: { status: "ok", request_kind: "JOIN" } as Record<string, unknown> | null,
  rpcError: null as { message: string } | null,
  rpcCalls: [] as Array<{ fn: string; args: Record<string, unknown> }>,
  notifications: [] as Array<Record<string, unknown>>,
  emails: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    auth: {
      getUser: () => Promise.resolve({ data: { user: state.user }, error: null }),
    },
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          single: () =>
            table === "profiles"
              ? Promise.resolve(
                  state.actor
                    ? { data: state.actor, error: null }
                    : { data: null, error: { message: "row not found" } }
                )
              : Promise.resolve(
                  state.request
                    ? { data: state.request, error: null }
                    : { data: null, error: { message: "row not found" } }
                ),
        }),
      }),
    }),
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: (fn: string, args: Record<string, unknown>) => {
      state.rpcCalls.push({ fn, args });
      return Promise.resolve({ data: state.rpcResult, error: state.rpcError });
    },
    from: (table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: { email: state.studentEmail }, error: null }),
            }),
          }),
        };
      }
      throw new Error(`Table non attendue dans le test : ${table}`);
    },
  }),
}));

vi.mock("@/lib/notifications/service", () => ({
  createNotification: (payload: Record<string, unknown>) => {
    state.notifications.push(payload);
    return Promise.resolve({ id: "n-1" });
  },
}));

vi.mock("@/lib/email/notifications", () => ({
  handleRegistrationDecisionEmail: (payload: Record<string, unknown>) => {
    state.emails.push(payload);
    return Promise.resolve({ ok: true });
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { decideRegistrationAction } from "@/actions/auth";

const REQUEST_ID = "55555555-5555-5555-5555-555555555555";
const CLASS_ID = "66666666-6666-6666-6666-666666666666";

function pendingRequest(overrides: Record<string, unknown> = {}) {
  return {
    id: REQUEST_ID,
    user_id: "u-2",
    class_id: CLASS_ID,
    previous_class_id: null,
    status: "PENDING",
    profiles: { first_name: "Awa", last_name: "Ndiaye" },
    classes: { name: "L2 Informatique" },
    ...overrides,
  };
}

beforeEach(() => {
  state.user = { id: "u-1" };
  state.actor = { role: "DELEGATE", class_id: CLASS_ID };
  state.request = pendingRequest();
  state.studentEmail = "etudiant@example.com";
  state.rpcResult = { status: "ok", request_kind: "JOIN" };
  state.rpcError = null;
  state.rpcCalls = [];
  state.notifications = [];
  state.emails = [];
});

describe("decideRegistrationAction — garde-fous d'entrée", () => {
  it("non authentifié → refus, aucune écriture", async () => {
    state.user = null;
    const res = await decideRegistrationAction(REQUEST_ID, "ACCEPTED");
    expect(res).toEqual({ error: "Non authentifié" });
    expect(state.rpcCalls).toHaveLength(0);
    expect(state.notifications).toHaveLength(0);
  });

  it("identifiant de demande invalide → refus avant tout accès base", async () => {
    const res = await decideRegistrationAction("not-a-uuid", "ACCEPTED");
    expect(res).toEqual({ error: "Demande invalide" });
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("décision inattendue → refus avant tout accès base", async () => {
    const res = await decideRegistrationAction(REQUEST_ID, "CANCELLED" as any);
    expect(res).toEqual({ error: "Décision invalide" });
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("demande introuvable → refus, aucun effet de bord", async () => {
    state.request = null;
    const res = await decideRegistrationAction(REQUEST_ID, "ACCEPTED");
    expect(res).toEqual({ error: "Demande introuvable" });
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("demande déjà tranchée → refus (décision définitive)", async () => {
    state.request = pendingRequest({ status: "ACCEPTED" });
    const res = await decideRegistrationAction(REQUEST_ID, "ACCEPTED");
    expect(res).toEqual({ error: "Cette demande a déjà été traitée (décision définitive)." });
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("appelant sans droit (étudiant ordinaire) → refus avant la transition", async () => {
    state.actor = { role: "STUDENT", class_id: CLASS_ID };
    const res = await decideRegistrationAction(REQUEST_ID, "ACCEPTED");
    expect(res).toEqual({ error: "Vous n'êtes pas autorisé à traiter cette demande." });
    expect(state.rpcCalls).toHaveLength(0);
    expect(state.notifications).toHaveLength(0);
    expect(state.emails).toHaveLength(0);
  });

  it("délégué d'une AUTRE classe que la demande → refus", async () => {
    state.actor = { role: "DELEGATE", class_id: "77777777-7777-7777-7777-777777777777" };
    const res = await decideRegistrationAction(REQUEST_ID, "ACCEPTED");
    expect(res).toEqual({ error: "Vous n'êtes pas autorisé à traiter cette demande." });
    expect(state.rpcCalls).toHaveLength(0);
  });
});

describe("decideRegistrationAction — transition atomique", () => {
  it("acceptation par le délégué de la classe → RPC avec l'identité de session", async () => {
    const res = await decideRegistrationAction(REQUEST_ID, "ACCEPTED");
    expect(res).toEqual({ success: true });
    expect(state.rpcCalls[0]).toEqual({
      fn: "classpulse_decide_request",
      args: {
        p_request_id: REQUEST_ID,
        p_decider_id: "u-1",
        p_decision: "ACCEPTED",
      },
    });
  });

  it("ADMIN (aucune classe assignée) peut décider d'une demande", async () => {
    state.actor = { role: "ADMIN", class_id: null };
    const res = await decideRegistrationAction(REQUEST_ID, "ACCEPTED");
    expect(res).toEqual({ success: true });
    expect(state.rpcCalls).toHaveLength(1);
  });

  it("transition refusée par la base (FORBIDDEN) → erreur, AUCUN effet de bord", async () => {
    state.rpcResult = { status: "error", code: "FORBIDDEN" };
    const res = await decideRegistrationAction(REQUEST_ID, "ACCEPTED");
    expect(res).toEqual({ error: "Vous n'êtes pas autorisé à traiter cette demande." });
    expect(state.notifications).toHaveLength(0);
    expect(state.emails).toHaveLength(0);
  });

  it("transition refusée par la base (déjà traitée entre-temps) → erreur, aucun effet de bord", async () => {
    state.rpcResult = { status: "error", code: "NOT_PENDING" };
    const res = await decideRegistrationAction(REQUEST_ID, "ACCEPTED");
    expect(res).toEqual({ error: "Cette demande a déjà été traitée (décision définitive)." });
    expect(state.notifications).toHaveLength(0);
    expect(state.emails).toHaveLength(0);
  });

  it("erreur de base → échec signalé, aucun succès annoncé", async () => {
    state.rpcError = { message: "deadlock detected" };
    const res = await decideRegistrationAction(REQUEST_ID, "ACCEPTED");
    expect(res).toEqual({ error: "La décision n'a pas pu être enregistrée : deadlock detected" });
    expect(state.notifications).toHaveLength(0);
    expect(state.emails).toHaveLength(0);
  });

  it("réponse absente de la base → refus (pas de succès implicite)", async () => {
    state.rpcResult = null;
    const res = await decideRegistrationAction(REQUEST_ID, "ACCEPTED");
    expect(res).not.toEqual({ success: true });
    expect(state.notifications).toHaveLength(0);
    expect(state.emails).toHaveLength(0);
  });
});

describe("decideRegistrationAction — effets de bord", () => {
  it("acceptation d'une INSCRIPTION : notification + email d'activation", async () => {
    const res = await decideRegistrationAction(REQUEST_ID, "ACCEPTED");
    expect(res).toEqual({ success: true });
    expect(state.notifications).toHaveLength(1);
    expect(state.notifications[0]).toMatchObject({
      userId: "u-2",
      type: "REGISTRATION_ACCEPTED",
      title: "Inscription acceptée",
      entityType: "registration_request",
      entityId: REQUEST_ID,
      link: "/dashboard/settings/class",
    });
    expect(state.emails).toHaveLength(1);
    expect(state.emails[0]).toMatchObject({
      decision: "ACCEPTED",
      userId: "u-2",
      email: "etudiant@example.com",
      firstName: "Awa",
      lastName: "Ndiaye",
    });
  });

  it("acceptation d'un CHANGEMENT : notification adaptée, PAS d'email d'activation", async () => {
    state.rpcResult = { status: "ok", request_kind: "CHANGE" };
    state.request = pendingRequest({ previous_class_id: "88888888-8888-8888-8888-888888888888" });
    const res = await decideRegistrationAction(REQUEST_ID, "ACCEPTED");
    expect(res).toEqual({ success: true });
    expect(state.notifications[0]).toMatchObject({
      type: "REGISTRATION_ACCEPTED",
      title: "Changement de classe accepté",
      message: expect.stringContaining("L2 Informatique"),
    });
    expect(state.emails).toHaveLength(0);
  });

  it("refus d'une INSCRIPTION : notification interne, aucun email", async () => {
    const res = await decideRegistrationAction(REQUEST_ID, "REJECTED");
    expect(res).toEqual({ success: true });
    expect(state.notifications).toHaveLength(1);
    expect(state.notifications[0]).toMatchObject({
      type: "REGISTRATION_REJECTED",
      title: "Inscription refusée",
      entityType: "registration_request",
      link: "/dashboard/settings/class",
    });
    expect(state.emails).toHaveLength(0);
  });

  it("refus d'un CHANGEMENT : on précise que la classe actuelle est conservée", async () => {
    state.rpcResult = { status: "ok", request_kind: "CHANGE" };
    state.request = pendingRequest({ previous_class_id: "88888888-8888-8888-8888-888888888888" });
    const res = await decideRegistrationAction(REQUEST_ID, "REJECTED");
    expect(res).toEqual({ success: true });
    expect(state.notifications[0]).toMatchObject({
      title: "Changement de classe refusé",
      message: expect.stringContaining("Vous restez membre de votre classe actuelle"),
    });
    expect(state.emails).toHaveLength(0);
  });
});
