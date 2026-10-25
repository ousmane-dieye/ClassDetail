import { describe, it, expect } from "vitest";
import {
  canManageSchedule,
  canPublishSchedule,
  canManageSubjectColor,
  type Actor,
} from "@/lib/business/permissions";

// ---------------------------------------------------------------------------
// Tests matrice de permissions du module Emploi du temps.
//  UI uniquement — la RLS reste la barrière réelle côté base.
// ---------------------------------------------------------------------------

const admin: Actor = { id: "u-admin", role: "ADMIN", classId: null };
const delegate: Actor = { id: "u-delegate", role: "DELEGATE", classId: "c1" };
const delegateOfOtherClass: Actor = { id: "u-delegate2", role: "DELEGATE", classId: "c2" };
const delegateWithoutClass: Actor = { id: "u-delegate3", role: "DELEGATE", classId: null };
const student: Actor = { id: "u-student", role: "STUDENT", classId: "c1" };
const studentWithoutClass: Actor = { id: "u-student2", role: "STUDENT", classId: null };

describe("canManageSchedule — création / édition / suppression de séances", () => {
  it("ADMIN : toujours autorisé, quelle que soit la classe", () => {
    expect(canManageSchedule(admin, "c1")).toBe(true);
    expect(canManageSchedule(admin, "c2")).toBe(true);
    expect(canManageSchedule(admin, "inconnue")).toBe(true);
    expect(canManageSchedule(admin, "")).toBe(true);
  });

  it("DELEGATE : uniquement pour sa propre classe", () => {
    expect(canManageSchedule(delegate, "c1")).toBe(true);
    expect(canManageSchedule(delegate, "c2")).toBe(false);
    expect(canManageSchedule(delegate, "")).toBe(false);
    expect(canManageSchedule(delegateWithoutClass, "c1")).toBe(false);
  });

  it("STUDENT : jamais, même pour sa propre classe", () => {
    expect(canManageSchedule(student, "c1")).toBe(false);
    expect(canManageSchedule(student, "c2")).toBe(false);
    expect(canManageSchedule(studentWithoutClass, "c1")).toBe(false);
  });
});

describe("canPublishSchedule — publication et exceptions datées", () => {
  it("suit exactement la même matrice que la gestion", () => {
    const actors: Actor[] = [
      admin,
      delegate,
      delegateOfOtherClass,
      delegateWithoutClass,
      student,
      studentWithoutClass,
    ];
    for (const actor of actors) {
      for (const classId of ["c1", "c2", ""]) {
        expect(canPublishSchedule(actor, classId)).toBe(canManageSchedule(actor, classId));
      }
    }
  });

  it("un étudiant ne peut ni publier ni annuler un cours", () => {
    expect(canPublishSchedule(student, "c1")).toBe(false);
    expect(canPublishSchedule(studentWithoutClass, "c1")).toBe(false);
  });
});

describe("canManageSubjectColor — couleur d'une matière", () => {
  it("ADMIN : toujours autorisé", () => {
    expect(canManageSubjectColor(admin, "c1")).toBe(true);
    expect(canManageSubjectColor(admin, "c2")).toBe(true);
  });

  it("DELEGATE : seulement les matières de sa classe", () => {
    expect(canManageSubjectColor(delegate, "c1")).toBe(true);
    expect(canManageSubjectColor(delegateOfOtherClass, "c1")).toBe(false);
    expect(canManageSubjectColor(delegateWithoutClass, "c1")).toBe(false);
  });

  it("STUDENT : jamais", () => {
    expect(canManageSubjectColor(student, "c1")).toBe(false);
    expect(canManageSubjectColor(student, "c2")).toBe(false);
    expect(canManageSubjectColor(studentWithoutClass, "c1")).toBe(false);
  });
});

describe("Matrice complète STUDENT / DELEGATE / ADMIN", () => {
  const functions = {
    canManageSchedule,
    canPublishSchedule,
    canManageSubjectColor,
  } as const;

  it("aucune fonction de gestion n'est accessible à un étudiant", () => {
    for (const fn of Object.values(functions)) {
      expect(fn(student, "c1")).toBe(false);
      expect(fn(student, "c2")).toBe(false);
      expect(fn(studentWithoutClass, "c1")).toBe(false);
    }
  });

  it("le délégué ne dépasse jamais les frontières de sa classe", () => {
    for (const fn of Object.values(functions)) {
      expect(fn(delegate, "c1")).toBe(true);
      expect(fn(delegateOfOtherClass, "c1")).toBe(false);
      expect(fn(delegateWithoutClass, "c1")).toBe(false);
    }
  });

  it("l'admin a un accès complet", () => {
    for (const fn of Object.values(functions)) {
      expect(fn(admin, "c1")).toBe(true);
      expect(fn(admin, "c2")).toBe(true);
    }
  });
});
