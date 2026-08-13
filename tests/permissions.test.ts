import { describe, it, expect } from "vitest";
import {
  canCreateTask,
  canDeleteResource,
  canManageRecordings,
  canModerateChat,
  canValidateRegistration,
  canManageClasses,
  canAppointDelegate,
  canViewClassStats,
} from "@/lib/business/permissions";

const admin = { id: "admin", role: "ADMIN" as const, classId: null };
const delegate = { id: "del", role: "DELEGATE" as const, classId: "c1" };
const student = { id: "stu", role: "STUDENT" as const, classId: "c1" };

describe("canCreateTask", () => {
  it("admin et délégué de la classe concernée peuvent créer", () => {
    expect(canCreateTask(admin, "c1")).toBe(true);
    expect(canCreateTask(delegate, "c1")).toBe(true);
  });

  it("un délégué ne peut pas créer dans une autre classe", () => {
    expect(canCreateTask(delegate, "c2")).toBe(false);
  });

  it("un étudiant ne peut jamais créer", () => {
    expect(canCreateTask(student, "c1")).toBe(false);
  });
});

describe("canDeleteResource", () => {
  it("l'auteur, le délégué de la classe et l'admin peuvent supprimer", () => {
    expect(canDeleteResource(student, "c1", student.id)).toBe(true);
    expect(canDeleteResource(delegate, "c1", "autre")).toBe(true);
    expect(canDeleteResource(admin, "c1", "autre")).toBe(true);
  });

  it("un étudiant ne peut pas supprimer le contenu d'un autre", () => {
    expect(canDeleteResource(student, "c1", "autre")).toBe(false);
  });
});

describe("permissions de classe", () => {
  it("canManageRecordings / canModerateChat / canValidateRegistration suivent la même règle", () => {
    expect(canManageRecordings(admin, "c1")).toBe(true);
    expect(canManageRecordings(delegate, "c1")).toBe(true);
    expect(canManageRecordings(delegate, "c2")).toBe(false);
    expect(canManageRecordings(student, "c1")).toBe(false);

    expect(canModerateChat(delegate, "c1")).toBe(true);
    expect(canModerateChat(student, "c1")).toBe(false);

    expect(canValidateRegistration(admin, "c1")).toBe(true);
    expect(canValidateRegistration(delegate, "c1")).toBe(true);
    expect(canValidateRegistration(student, "c1")).toBe(false);
  });
});

describe("permissions globales (ADMIN uniquement)", () => {
  it("canManageClasses et canAppointDelegate sont réservées à l'admin", () => {
    expect(canManageClasses(admin)).toBe(true);
    expect(canManageClasses(delegate)).toBe(false);

    expect(canAppointDelegate(admin)).toBe(true);
    expect(canAppointDelegate(delegate)).toBe(false);
  });

  it("canViewClassStats n'autorise que l'admin ou le délégué de la classe", () => {
    expect(canViewClassStats(admin, "c1")).toBe(true);
    expect(canViewClassStats(delegate, "c1")).toBe(true);
    expect(canViewClassStats(delegate, "c2")).toBe(false);
    expect(canViewClassStats(student, "c1")).toBe(false);
  });
});
