import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Tests S8 — Suppression documents / hints (Server Actions).
//  Règle métier : STUDENT = son propre contenu ; DELEGATE = contenu de SA
//  classe ; ADMIN = global. Les actions vérifient explicitement la règle
//  (canDeleteResource) en plus du RLS, et renvoient des erreurs explicites.
// ---------------------------------------------------------------------------

type Role = "ADMIN" | "DELEGATE" | "STUDENT";

const state = vi.hoisted(() => ({
  user: null as { id: string } | null,
  profile: null as { role: Role; class_id: string | null } | null,
  resource: null as { class_id: string; author_id: string } | null,
  deleteCalled: null as string | null,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: state.user }, error: null }),
    },
    from: (table: string) => {
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        single: async () => {
          if (table === "profiles") return { data: state.profile, error: null };
          return { data: state.resource, error: null };
        },
        delete: () => ({
          eq: async () => {
            state.deleteCalled = table;
            return { error: null };
          },
        }),
      };
      return chain;
    },
  }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: () => {},
}));

import { deleteDocumentAction } from "@/actions/documents";
import { deleteHintAction } from "@/actions/hints";

const setup = ({
  user = { id: "u-1" },
  profile = { role: "STUDENT" as Role, class_id: "c1" as string | null },
  resource = { class_id: "c1", author_id: "u-1" },
}: {
  user?: { id: string } | null;
  profile?: { role: Role; class_id: string | null } | null;
  resource?: { class_id: string; author_id: string } | null;
} = {}) => {
  state.user = user;
  state.profile = profile;
  state.resource = resource;
  state.deleteCalled = null;
};

beforeEach(() => setup());

describe("deleteDocumentAction — règle de suppression alignée", () => {
  it("non authentifié : refus", async () => {
    setup({ user: null });
    const res = await deleteDocumentAction("d-1");
    expect(res).toEqual({ error: "Non authentifié" });
    expect(state.deleteCalled).toBeNull();
  });

  it("STUDENT supprime son propre document : autorisé", async () => {
    const res = await deleteDocumentAction("d-1");
    expect(res).toEqual({ success: true });
    expect(state.deleteCalled).toBe("documents");
  });

  it("STUDENT supprime le document d'un autre étudiant : refus", async () => {
    setup({ resource: { class_id: "c1", author_id: "u-2" } });
    const res = await deleteDocumentAction("d-1");
    expect(res).toEqual({ error: "Vous n'êtes pas autorisé à supprimer ce document" });
    expect(state.deleteCalled).toBeNull();
  });

  it("DELEGATE supprime le document d'un étudiant de SA classe : autorisé", async () => {
    setup({ profile: { role: "DELEGATE", class_id: "c1" }, resource: { class_id: "c1", author_id: "u-2" } });
    const res = await deleteDocumentAction("d-1");
    expect(res).toEqual({ success: true });
    expect(state.deleteCalled).toBe("documents");
  });

  it("DELEGATE supprime le document d'une AUTRE classe : refus", async () => {
    setup({ profile: { role: "DELEGATE", class_id: "c1" }, resource: { class_id: "c2", author_id: "u-2" } });
    const res = await deleteDocumentAction("d-1");
    expect(res).toEqual({ error: "Vous n'êtes pas autorisé à supprimer ce document" });
    expect(state.deleteCalled).toBeNull();
  });

  it("ADMIN supprime n'importe quel document : autorisé", async () => {
    setup({ profile: { role: "ADMIN", class_id: null }, resource: { class_id: "c9", author_id: "u-9" } });
    const res = await deleteDocumentAction("d-1");
    expect(res).toEqual({ success: true });
    expect(state.deleteCalled).toBe("documents");
  });

  it("utilisateur PENDING (rôle STUDENT) supprime le document d'un autre : refus", async () => {
    setup({ resource: { class_id: "c1", author_id: "u-2" } });
    const res = await deleteDocumentAction("d-1");
    expect(res).toEqual({ error: "Vous n'êtes pas autorisé à supprimer ce document" });
    expect(state.deleteCalled).toBeNull();
  });

  it("document introuvable : erreur explicite", async () => {
    setup({ resource: null });
    const res = await deleteDocumentAction("d-missing");
    expect(res).toEqual({ error: "Document introuvable" });
    expect(state.deleteCalled).toBeNull();
  });
});

describe("deleteHintAction — même règle pour les hints", () => {
  it("DELEGATE supprime le hint d'un étudiant de SA classe : autorisé", async () => {
    setup({ profile: { role: "DELEGATE", class_id: "c1" }, resource: { class_id: "c1", author_id: "u-2" } });
    const res = await deleteHintAction("h-1");
    expect(res).toEqual({ success: true });
    expect(state.deleteCalled).toBe("hints");
  });

  it("DELEGATE supprime le hint d'une AUTRE classe : refus", async () => {
    setup({ profile: { role: "DELEGATE", class_id: "c1" }, resource: { class_id: "c3", author_id: "u-2" } });
    const res = await deleteHintAction("h-1");
    expect(res).toEqual({ error: "Vous n'êtes pas autorisé à supprimer ce hint" });
    expect(state.deleteCalled).toBeNull();
  });

  it("STUDENT supprime le hint d'un autre étudiant : refus", async () => {
    setup({ resource: { class_id: "c1", author_id: "u-2" } });
    const res = await deleteHintAction("h-1");
    expect(res).toEqual({ error: "Vous n'êtes pas autorisé à supprimer ce hint" });
    expect(state.deleteCalled).toBeNull();
  });
});
