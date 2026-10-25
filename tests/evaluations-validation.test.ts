import { describe, it, expect } from "vitest";
import { evaluationSchema, evaluationResourcesSchema, EVALUATION_TYPES } from "@/lib/validation/schemas";

// ---------------------------------------------------------------------------
// Tests validation — module Évaluations.
//  Règle NON NÉGOCIABLE : les chapitres concernés sont TOUJOURS facultatifs.
//  Huit tests dédiés (ci-dessous) verrouillent ce comportement à chaque
//  modification du schéma.
// ---------------------------------------------------------------------------

const CLASS_ID = "3f1a2b4c-5d6e-7f80-91a2-b3c4d5e6f708";
const SUBJECT_ID = "9c8b7a6d-5e4f-3021-a0b9-c8d7e6f5a4b3";

function validInput(overrides: Record<string, unknown> = {}) {
  return {
    classId: CLASS_ID,
    subjectId: SUBJECT_ID,
    title: "Examen final",
    type: "EXAMEN",
    date: "2026-06-15",
    publish: true,
    ...overrides,
  };
}

// ── Chapitres facultatifs — 8 tests dédiés (exigence produit) ──────────────

describe("evaluationSchema — chapitres TOUJOURS facultatifs", () => {
  it("1. accepte une évaluation sans clé `chapters`", () => {
    const res = evaluationSchema.safeParse(validInput());
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.chapters).toEqual([]);
  });

  it("2. accepte explicitement un tableau vide", () => {
    const res = evaluationSchema.safeParse(validInput({ chapters: [] }));
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.chapters).toEqual([]);
  });

  it("3. accepte un tableau avec des chaînes vides (filtrées, jamais refusées)", () => {
    const res = evaluationSchema.safeParse(validInput({ chapters: ["", "  ", ""] }));
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.chapters).toEqual([]);
  });

  it("4. accepte une évaluation SANS heure ni chapitres (informations minimales)", () => {
    const res = evaluationSchema.safeParse(
      validInput({ startTime: "", endTime: "", chapters: undefined })
    );
    expect(res.success).toBe(true);
  });

  it("5. accepte une évaluation brouillon sans chapitres", () => {
    const res = evaluationSchema.safeParse(validInput({ publish: false }));
    expect(res.success).toBe(true);
  });

  it("6. n'exige AUCUN chapitre pour un type quelconque (CC → AUTRE)", () => {
    for (const type of EVALUATION_TYPES) {
      const res = evaluationSchema.safeParse(validInput({ type }));
      expect(res.success, `type ${type} sans chapitres`).toBe(true);
    }
  });

  it("7. normalise les chapitres : trim + retrait des chaînes vides", () => {
    const res = evaluationSchema.safeParse(
      validInput({ chapters: ["  Limites  ", "", "Dérivées", "   "] })
    );
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.chapters).toEqual(["Limites", "Dérivées"]);
  });

  it("8. refuse au-delà de 30 chapitres (garde-fou de taille, jamais de présence)", () => {
    const many = Array.from({ length: 31 }, (_, i) => `Chapitre ${i + 1}`);
    const res = evaluationSchema.safeParse(validInput({ chapters: many }));
    expect(res.success).toBe(false);
    // …mais 30 reste accepté.
    const ok = evaluationSchema.safeParse(validInput({ chapters: many.slice(0, 30) }));
    expect(ok.success).toBe(true);
  });
});

// ── Heures facultatives ────────────────────────────────────────────────────

describe("evaluationSchema — horaires facultatifs", () => {
  it("accepte une heure de début seule", () => {
    expect(evaluationSchema.safeParse(validInput({ startTime: "08:00", endTime: "" })).success).toBe(true);
  });

  it("exige une heure de début si une heure de fin est fournie", () => {
    const res = evaluationSchema.safeParse(validInput({ startTime: "", endTime: "10:00" }));
    expect(res.success).toBe(false);
  });

  it("exige une fin strictement postérieure au début", () => {
    const res = evaluationSchema.safeParse(validInput({ startTime: "10:00", endTime: "08:00" }));
    expect(res.success).toBe(false);
  });

  it("accepte début égal fin refusé (plage vide inutile)", () => {
    const res = evaluationSchema.safeParse(validInput({ startTime: "08:00", endTime: "08:00" }));
    expect(res.success).toBe(false);
  });
});

// ── Champs généraux ────────────────────────────────────────────────────────

describe("evaluationSchema — champs généraux", () => {
  it("refuse un intitulé trop court", () => {
    expect(evaluationSchema.safeParse(validInput({ title: "ok" })).success).toBe(false);
  });

  it("refuse une date non ISO", () => {
    expect(evaluationSchema.safeParse(validInput({ date: "15/06/2026" })).success).toBe(false);
  });

  it("refuse un type hors enum", () => {
    expect(evaluationSchema.safeParse(validInput({ type: "ORAL" })).success).toBe(false);
  });

  it("coerce `publish` (checkbox HTML)", () => {
    const res = evaluationSchema.safeParse(validInput({ publish: "true" }));
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.publish).toBe(true);
  });
});

// ── Ressources de révision (facultatives) ──────────────────────────────────

describe("evaluationResourcesSchema — ressources facultatives", () => {
  const EVAL_ID = "1a2b3c4d-5e6f-7081-92a3-b4c5d6e7f809";

  it("accepte une évaluation sans aucune ressource", () => {
    const res = evaluationResourcesSchema.safeParse({ evaluationId: EVAL_ID });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.documentIds).toEqual([]);
      expect(res.data.hintIds).toEqual([]);
    }
  });

  it("accepte uniquement des documents, ou uniquement des hints", () => {
    const docId = "aa11bb22-cc33-4d55-8e66-ff7788990011";
    const onlyDoc = evaluationResourcesSchema.safeParse({ evaluationId: EVAL_ID, documentIds: [docId] });
    expect(onlyDoc.success).toBe(true);

    const hintId = "11aa22bb-33cc-4d55-8e66-ff7788990011";
    const onlyHint = evaluationResourcesSchema.safeParse({ evaluationId: EVAL_ID, hintIds: [hintId] });
    expect(onlyHint.success).toBe(true);
  });

  it("refuse un identifiant non UUID", () => {
    const res = evaluationResourcesSchema.safeParse({ evaluationId: EVAL_ID, documentIds: ["not-a-uuid"] });
    expect(res.success).toBe(false);
  });
});
