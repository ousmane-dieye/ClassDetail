import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Tests Server Actions — module Évaluations.
//  Verrouillent les règles de sécurité ET de notification :
//   * chapitres facultatifs sur la création (aucune valeur artificielle) ;
//   * brouillon = JAMAIS de notification ;
//   * édition sans impact (chapitres/description seuls) = JAMAIS de
//     notification ;
//   * annulation tracée (motif facultatif, statut CANCELLED) ;
//   * étudiant = refus explicite, même si la RLS répondrait aussi ;
//   * conflits = warnings sur le SUCCÈS, jamais une erreur bloquante.
// ---------------------------------------------------------------------------

type Role = "ADMIN" | "DELEGATE" | "STUDENT";

const state = vi.hoisted(() => ({
  user: null as { id: string } | null,
  profile: null as { id: string; role: Role; class_id: string | null } | null,
  subjectInClass: true,
  evaluation: null as Record<string, any> | null,
  inserted: null as Record<string, any> | null,
  updated: null as Record<string, any> | null,
  updateError: null as { message: string } | null,
  deleteError: null as { message: string } | null,
  notifications: [] as Array<Record<string, any>>,
  revalidated: [] as string[],
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: state.user }, error: null }),
    },
    from: (table: string) => {
      const chain: any = {
        _table: table,
        select: () => chain,
        eq: () => chain,
        gte: () => chain,
        lt: () => chain,
        in: () => chain,
        order: () => chain,
        limit: () => chain,
        single: async () => {
          if (table === "profiles") return { data: state.profile, error: null };
          if (table === "subjects")
            return { data: state.subjectInClass ? { id: "sub-1" } : null, error: null };
          if (table === "evaluations")
            return { data: state.evaluation, error: null };
          return { data: null, error: null };
        },
        maybeSingle: async () => {
          if (table === "profiles") return { data: state.profile, error: null };
          if (table === "subjects")
            return { data: state.subjectInClass ? { id: "sub-1", name: "Mathématiques" } : null, error: null };
          if (table === "evaluations")
            return { data: state.evaluation, error: null };
          return { data: null, error: null };
        },
        insert: (payload: Record<string, any>) => {
          state.inserted = payload;
          return {
            select: () => ({ single: async () => ({ data: { id: "ev-new" }, error: null }) }),
          };
        },
        update: (payload: Record<string, any>) => ({
          eq: async () => {
            state.updated = payload;
            return { error: state.updateError };
          },
        }),
        delete: () => ({
          eq: async () => ({ error: state.deleteError }),
        }),
      };
      // Les listes (conflits, membres) répondent avec des tableaux vides.
      chain.then = undefined;
      return chain;
    },
  }),
}));

vi.mock("@/lib/schedule/queries", () => ({
  getScheduleSnapshot: async () => ({
    snapshot: { sessions: [], exceptions: [] },
    error: undefined,
  }),
}));

vi.mock("@/lib/notifications/service", () => ({
  notifyClassMembers: vi.fn(async (payload: Record<string, any>) => {
    state.notifications.push(payload);
    return 2;
  }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (p: string) => {
    state.revalidated.push(p);
  },
}));

import {
  createEvaluationAction,
  updateEvaluationAction,
  publishEvaluationAction,
  cancelEvaluationAction,
  deleteEvaluationAction,
  getEvaluationEditDataAction,
} from "@/actions/evaluations";
import { notifyClassMembers } from "@/lib/notifications/service";

const CLASS_ID = "3f1a2b4c-5d6e-7f80-91a2-b3c4d5e6f708";
const SUBJECT_ID = "9c8b7a6d-5e4f-3021-a0b9-c8d7e6f5a4b3";

function setup({
  user = { id: "u-1" },
  profile = { id: "u-1", role: "DELEGATE" as Role, class_id: CLASS_ID },
  subjectInClass = true,
  evaluation = null as Record<string, any> | null,
}: {
  user?: { id: string } | null;
  profile?: { id: string; role: Role; class_id: string | null } | null;
  subjectInClass?: boolean;
  evaluation?: Record<string, any> | null;
} = {}) {
  state.user = user;
  state.profile = profile;
  state.subjectInClass = subjectInClass;
  state.evaluation = evaluation;
  state.inserted = null;
  state.updated = null;
  state.updateError = null;
  state.deleteError = null;
  state.notifications = [];
  state.revalidated = [];
  vi.mocked(notifyClassMembers).mockClear();
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    classId: CLASS_ID,
    subjectId: SUBJECT_ID,
    title: "Examen final",
    type: "EXAMEN",
    date: "2026-06-15",
    startTime: "08:00",
    endTime: "10:00",
    room: "A1",
    chapters: ["Limites"],
    publish: true,
    ...overrides,
  };
}

function existing(overrides: Record<string, any> = {}) {
  return {
    id: "ev-1",
    class_id: CLASS_ID,
    subject_id: SUBJECT_ID,
    title: "Examen final",
    type: "EXAMEN",
    date: "2026-06-15",
    start_time: "08:00:00",
    end_time: "10:00:00",
    room: "A1",
    status: "PUBLISHED",
    ...overrides,
  };
}

beforeEach(() => setup());

// ── createEvaluationAction ─────────────────────────────────────────────────

describe("createEvaluationAction", () => {
  it("refuse un non authentifié", async () => {
    setup({ user: null });
    const res = await createEvaluationAction(input());
    expect(res).toEqual({ error: "Non authentifié" });
    expect(state.inserted).toBeNull();
  });

  it("refuse un étudiant (lecture seule)", async () => {
    setup({ profile: { id: "u-1", role: "STUDENT", class_id: CLASS_ID } });
    const res = await createEvaluationAction(input());
    expect(res).toEqual({
      error: "Vous n'êtes pas autorisé à gérer les évaluations de cette classe.",
    });
    expect(state.inserted).toBeNull();
  });

  it("refuse un délégué d'une AUTRE classe", async () => {
    setup({ profile: { id: "u-1", role: "DELEGATE", class_id: "other-class" } });
    const res = await createEvaluationAction(input());
    expect("error" in res).toBe(true);
    expect(state.inserted).toBeNull();
  });

  it("refuse une matière d'une autre classe", async () => {
    setup({ subjectInClass: false });
    const res = await createEvaluationAction(input());
    expect(res).toEqual({ error: "Cette matière n'appartient pas à la classe sélectionnée." });
    expect(state.inserted).toBeNull();
  });

  it("accepte une création SANS chapitres (facultatifs)", async () => {
    const res = await createEvaluationAction(input({ chapters: undefined }));
    expect("success" in res && res.success).toBe(true);
    // Pas de tableau fantôme : soit absent, soit vide — jamais « À définir ».
    const chapters = state.inserted?.chapters;
    expect(chapters === undefined || (Array.isArray(chapters) && chapters.length === 0)).toBe(true);
    expect(JSON.stringify(state.inserted)).not.toContain("À définir");
  });

  it("publie immédiatement et notifie la classe (hors auteur)", async () => {
    const res = await createEvaluationAction(input({ publish: true }));
    expect("success" in res && res.success).toBe(true);
    expect(state.inserted?.status).toBe("PUBLISHED");
    expect(state.notifications).toHaveLength(1);
    expect(state.notifications[0]?.type).toBe("EVALUATION_PUBLISHED");
    expect(state.notifications[0]?.link).toBe("/dashboard/evaluations/ev-new");
  });

  it("en brouillon : AUCUNE notification", async () => {
    const res = await createEvaluationAction(input({ publish: false }));
    expect("success" in res && res.success).toBe(true);
    expect(state.inserted?.status).toBe("DRAFT");
    expect(state.notifications).toHaveLength(0);
  });

  it("renvoie les warnings de conflit sur le SUCCÈS (non bloquants)", async () => {
    const res = await createEvaluationAction(input());
    expect("success" in res && res.success).toBe(true);
    // Aucune donnée en conflit dans le mock → tableau présent mais vide.
    expect("warnings" in res && Array.isArray(res.warnings)).toBe(true);
    expect("warnings" in res && res.warnings).toEqual([]);
  });
});

// ── updateEvaluationAction ─────────────────────────────────────────────────

describe("updateEvaluationAction", () => {
  it("refuse si l'évaluation n'existe pas / n'est pas visible", async () => {
    const res = await updateEvaluationAction("ev-404", input());
    expect(res).toEqual({ error: "Évaluation introuvable ou accès refusé." });
  });

  it("refuse si l'évaluation appartient à une autre classe", async () => {
    setup({ evaluation: existing({ class_id: "another-class" }) });
    const res = await updateEvaluationAction("ev-1", input());
    expect("error" in res).toBe(true);
    expect(state.updated).toBeNull();
  });

  it("édition des SEULS chapitres sur une évaluation publiée : AUCUNE notification", async () => {
    setup({ evaluation: existing() });
    const res = await updateEvaluationAction(
      "ev-1",
      input({ chapters: ["Nouveaux chapitres"], description: "Détails" })
    );
    expect("success" in res && res.success).toBe(true);
    expect(state.notifications).toHaveLength(0);
  });

  it("changement de date d'une publiée : notification « reportée » avec l'ancienne date", async () => {
    setup({ evaluation: existing() });
    const res = await updateEvaluationAction("ev-1", input({ date: "2026-06-20" }));
    expect("success" in res && res.success).toBe(true);
    expect(state.updated?.rescheduled_from).toBe("2026-06-15");
    expect(state.notifications).toHaveLength(1);
    expect(state.notifications[0]?.title).toContain("reportée");
    expect(state.notifications[0]?.message).toContain("ancienne date");
  });

  it("édition d'un BROUILLON : AUCUNE notification (jamais visible des étudiants)", async () => {
    setup({ evaluation: existing({ status: "DRAFT" }) });
    const res = await updateEvaluationAction("ev-1", input({ title: "Nouvel intitulé long" }));
    expect("success" in res && res.success).toBe(true);
    expect(state.notifications).toHaveLength(0);
  });

  it("modification matérielle d'une publiée : notification unique", async () => {
    setup({ evaluation: existing() });
    const res = await updateEvaluationAction("ev-1", input({ title: "Examen blanc final" }));
    expect("success" in res && res.success).toBe(true);
    expect(state.notifications).toHaveLength(1);
    expect(state.notifications[0]?.type).toBe("EVALUATION_UPDATED");
  });
});

// ── publish / cancel / delete ──────────────────────────────────────────────

describe("publishEvaluationAction", () => {
  it("publie un brouillon et notifie", async () => {
    setup({ evaluation: existing({ status: "DRAFT" }) });
    const res = await publishEvaluationAction("ev-1");
    expect("success" in res && res.success).toBe(true);
    expect(state.updated?.status).toBe("PUBLISHED");
    expect(state.notifications).toHaveLength(1);
    expect(state.notifications[0]?.type).toBe("EVALUATION_PUBLISHED");
  });

  it("une évaluation déjà publiée est un no-op sans notification", async () => {
    setup({ evaluation: existing() });
    const res = await publishEvaluationAction("ev-1");
    expect("success" in res && res.success).toBe(true);
    expect(state.notifications).toHaveLength(0);
  });

  it("une évaluation annulée ne peut pas être republiée", async () => {
    setup({ evaluation: existing({ status: "CANCELLED" }) });
    const res = await publishEvaluationAction("ev-1");
    expect(res).toEqual({
      error: "Une évaluation annulée ne peut pas être republiée. Créez-en une nouvelle.",
    });
    expect(state.notifications).toHaveLength(0);
  });

  it("refuse un étudiant", async () => {
    setup({ evaluation: existing({ status: "DRAFT" }), profile: { id: "u-1", role: "STUDENT", class_id: CLASS_ID } });
    const res = await publishEvaluationAction("ev-1");
    expect("error" in res).toBe(true);
    expect(state.updated).toBeNull();
  });
});

describe("cancelEvaluationAction", () => {
  it("annule une publiée avec motif et notifie", async () => {
    setup({ evaluation: existing() });
    const res = await cancelEvaluationAction("ev-1", "Salle indisponible");
    expect("success" in res && res.success).toBe(true);
    expect(state.updated?.status).toBe("CANCELLED");
    expect(state.updated?.cancellation_note).toBe("Salle indisponible");
    expect(state.notifications).toHaveLength(1);
    expect(state.notifications[0]?.type).toBe("EVALUATION_CANCELLED");
    expect(state.notifications[0]?.message).toContain("Salle indisponible");
  });

  it("annule sans motif (facultatif) : note null, notification sans « Motif »", async () => {
    setup({ evaluation: existing() });
    const res = await cancelEvaluationAction("ev-1");
    expect("success" in res && res.success).toBe(true);
    expect(state.updated?.cancellation_note).toBeNull();
    expect(state.notifications[0]?.message).not.toContain("Motif");
  });

  it("un brouillon ne peut pas être annulé (on le supprime)", async () => {
    setup({ evaluation: existing({ status: "DRAFT" }) });
    const res = await cancelEvaluationAction("ev-1");
    expect(res).toEqual({ error: "Seule une évaluation publiée peut être annulée." });
    expect(state.updated).toBeNull();
  });
});

describe("deleteEvaluationAction", () => {
  it("un brouillon se supprime sans notification", async () => {
    setup({ evaluation: existing({ status: "DRAFT" }) });
    const res = await deleteEvaluationAction("ev-1");
    expect("success" in res && res.success).toBe(true);
    expect(state.notifications).toHaveLength(0);
  });

  it("supprimer une publiée notifie explicitement un retrait", async () => {
    setup({ evaluation: existing() });
    const res = await deleteEvaluationAction("ev-1");
    expect("success" in res && res.success).toBe(true);
    expect(state.notifications).toHaveLength(1);
    expect(state.notifications[0]?.title).toContain("retirée");
  });

  it("refuse un étudiant", async () => {
    setup({ profile: { id: "u-1", role: "STUDENT", class_id: CLASS_ID } });
    const res = await deleteEvaluationAction("ev-1");
    expect("error" in res).toBe(true);
  });
});

// ── getEvaluationEditDataAction ────────────────────────────────────────────

describe("getEvaluationEditDataAction", () => {
  it("refuse un étudiant (données d'édition)", async () => {
    setup({
      profile: { id: "u-1", role: "STUDENT", class_id: CLASS_ID },
      evaluation: { class_id: CLASS_ID, description: "d", chapters: ["c"] },
    });
    const res = await getEvaluationEditDataAction("ev-1");
    expect("error" in res).toBe(true);
  });

  it("retourne description + chapitres d'une évaluation de sa classe", async () => {
    setup({
      evaluation: { class_id: CLASS_ID, description: "Détails utiles", chapters: ["Limites"] },
    });
    const res = await getEvaluationEditDataAction("ev-1");
    expect(res).toEqual({ success: true, description: "Détails utiles", chapters: ["Limites"] });
  });

  it("normalise les chapitres absents en tableau vide (jamais de valeur artificielle)", async () => {
    setup({
      evaluation: { class_id: CLASS_ID, description: null, chapters: null },
    });
    const res = await getEvaluationEditDataAction("ev-1");
    expect(res).toEqual({ success: true, description: "", chapters: [] });
  });
});
