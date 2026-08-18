import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Tests F1 : resubmitRegistrationAction — resoumission après REJECTED.
// Les clients Supabase et next/navigation sont simulés ; on vérifie la
// LOGIQUE de l'action (garde-fous applicatifs) pour chaque scénario du
// workflow REJECTED -> PENDING -> validation -> ACCEPTED.
// ---------------------------------------------------------------------------

const state = vi.hoisted(() => ({
  user: null as { id: string } | null,
  profile: null as { id: string; role: string } | null,
  requests: [] as Array<{ status: string }>,
  profileUpdateError: null as string | null,
  insertError: null as { code?: string; message?: string } | null,
  inserted: [] as Array<Record<string, unknown>>,
  redirectTarget: null as string | null,
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
    from: (table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: state.profile, error: null }),
            }),
          }),
          update: () => ({
            eq: () => Promise.resolve({ data: null, error: state.profileUpdateError }),
          }),
        };
      }
      // registration_requests
      return {
        select: () => ({
          eq: () => ({
            order: () => Promise.resolve({ data: state.requests, error: null }),
          }),
        }),
        insert: (payload: Record<string, unknown>) => {
          state.inserted.push(payload);
          return Promise.resolve({ data: null, error: state.insertError });
        },
      };
    },
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    state.redirectTarget = url;
    throw new Error("NEXT_REDIRECT");
  },
  revalidatePath: () => {},
}));

import { resubmitRegistrationAction } from "@/actions/auth";

const FORM = (overrides: Record<string, string> = {}) => {
  const fd = new FormData();
  fd.set("firstName", "Amadou");
  fd.set("lastName", "Diallo");
  fd.set("classId", "22222222-2222-2222-2222-222222222222");
  for (const [k, v] of Object.entries(overrides)) fd.set(k, v);
  return fd;
};

function expectNoInsert() {
  expect(state.inserted).toHaveLength(0);
}

beforeEach(() => {
  state.user = { id: "u-1" };
  state.profile = { id: "u-1", role: "STUDENT" };
  state.requests = [{ status: "REJECTED" }];
  state.profileUpdateError = null;
  state.insertError = null;
  state.inserted = [];
  state.redirectTarget = null;
});

describe("resubmitRegistrationAction — F1", () => {
  it("REJECTED -> nouvelle demande -> PENDING (avec historique conservé)", async () => {
    let threw = false;
    try {
      await resubmitRegistrationAction(FORM());
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
    expect(state.redirectTarget).toBe("/pending");
    expect(state.inserted).toHaveLength(1);
    expect(state.inserted[0]).toMatchObject({
      user_id: "u-1",
      status: "PENDING",
      class_id: "22222222-2222-2222-2222-222222222222",
    });
    // L'ancienne demande REJECTED reste (pas d'écrasement).
    expect(state.requests.map((r) => r.status)).toEqual(["REJECTED"]);
  });

  it("ACCEPTED -> refuse (décision définitive, aucun contournement)", async () => {
    state.requests = [{ status: "ACCEPTED" }];
    const result = await resubmitRegistrationAction(FORM());
    expect(result).toEqual(expect.objectContaining({ error: expect.stringContaining("validé") }));
    expectNoInsert();
  });

  it("PENDING -> refuse la double demande", async () => {
    state.requests = [{ status: "PENDING" }];
    const result = await resubmitRegistrationAction(FORM());
    expect(result).toEqual(expect.objectContaining({ error: expect.stringContaining("déjà en attente") }));
    expectNoInsert();
  });

  it("PENDING (bascule base) -> refuse la double demande", async () => {
    state.requests = [];
    state.insertError = { code: "23505", message: "duplicate" };
    const result = await resubmitRegistrationAction(FORM());
    expect(result).toEqual(expect.objectContaining({ error: expect.stringContaining("déjà en attente") }));
    expect(state.inserted).toHaveLength(1); // tenté, bloqué par l'index unique
  });

  it("classe invalide (FK 23503) -> erreur 'classe n'existe pas'", async () => {
    state.requests = [];
    state.insertError = { code: "23503", message: "fk" };
    const result = await resubmitRegistrationAction(FORM());
    expect(result).toEqual(expect.objectContaining({ error: expect.stringContaining("n'existe pas") }));
  });

  it("utilisateur sans compte (non connecté) -> refus", async () => {
    state.user = null;
    const result = await resubmitRegistrationAction(FORM());
    expect(result).toEqual(expect.objectContaining({ error: expect.stringContaining("connecter") }));
    expectNoInsert();
  });

  it("mauvais utilisateur (aucun profil lié) -> refus", async () => {
    state.profile = null;
    const result = await resubmitRegistrationAction(FORM());
    expect(result).toEqual(expect.objectContaining({ error: expect.stringContaining("Profil introuvable") }));
    expectNoInsert();
  });

  it("ADMIN -> refuse (aucun workflow d'inscription pour un admin)", async () => {
    state.profile = { id: "u-1", role: "ADMIN" };
    const result = await resubmitRegistrationAction(FORM());
    expect(result).toEqual(expect.objectContaining({ error: expect.stringContaining("administrateur") }));
    expectNoInsert();
  });

  it("classe non fournie (uuid invalide) -> validation zod", async () => {
    const result = await resubmitRegistrationAction(FORM({ classId: "" }));
    expect(result).toEqual(expect.objectContaining({ error: expect.stringContaining("classe") }));
    expectNoInsert();
  });

  it("prénom trop court -> validation zod", async () => {
    const result = await resubmitRegistrationAction(FORM({ firstName: "A" }));
    expect(result).toEqual(expect.objectContaining({ error: expect.stringContaining("Prénom") }));
    expectNoInsert();
  });

  it("échec de mise à jour du profil -> erreur, aucune demande créée", async () => {
    state.requests = [];
    state.profileUpdateError = "boom";
    const result = await resubmitRegistrationAction(FORM());
    expect(result).toEqual(expect.objectContaining({ error: expect.stringContaining("profil") }));
    expectNoInsert();
  });
});
