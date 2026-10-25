import { describe, it, expect } from "vitest";
import {
  canManageEvaluations,
  canManageEvaluationResources,
} from "@/lib/business/permissions";

// ---------------------------------------------------------------------------
// Tests permissions — module Évaluations.
//  Règle reprise à l'identique de l'emploi du temps :
//   STUDENT  : lecture seule (jamais de gestion) ;
//   DELEGATE : gestion de SA classe uniquement ;
//   ADMIN    : toutes les classes.
//  Ces fonctions sont appelées par CHAQUE Server Action du module, en plus
//  de la RLS PostgreSQL (défense en profondeur).
// ---------------------------------------------------------------------------

const admin = { id: "admin", role: "ADMIN" as const, classId: null };
const delegate = { id: "del", role: "DELEGATE" as const, classId: "c1" };
const otherDelegate = { id: "del2", role: "DELEGATE" as const, classId: "c2" };
const student = { id: "stu", role: "STUDENT" as const, classId: "c1" };

describe("canManageEvaluations", () => {
  it("ADMIN gère toutes les classes", () => {
    expect(canManageEvaluations(admin, "c1")).toBe(true);
    expect(canManageEvaluations(admin, "c9")).toBe(true);
  });

  it("DELEGATE gère uniquement sa propre classe", () => {
    expect(canManageEvaluations(delegate, "c1")).toBe(true);
    expect(canManageEvaluations(delegate, "c2")).toBe(false);
    expect(canManageEvaluations(otherDelegate, "c1")).toBe(false);
  });

  it("STUDENT ne gère jamais, même sa propre classe", () => {
    expect(canManageEvaluations(student, "c1")).toBe(false);
    expect(canManageEvaluations(student, "c2")).toBe(false);
  });

  it("un délégué sans classe ne gère rien", () => {
    const homeless = { id: "d0", role: "DELEGATE" as const, classId: null };
    expect(canManageEvaluations(homeless, "c1")).toBe(false);
  });
});

describe("canManageEvaluationResources", () => {
  it("suit exactement la même règle que la gestion d'évaluation", () => {
    for (const actor of [admin, delegate, otherDelegate, student]) {
      for (const classId of ["c1", "c2"]) {
        expect(canManageEvaluationResources(actor, classId)).toBe(
          canManageEvaluations(actor, classId)
        );
      }
    }
  });

  it("un étudiant ne peut pas associer de ressources", () => {
    expect(canManageEvaluationResources(student, "c1")).toBe(false);
  });
});
