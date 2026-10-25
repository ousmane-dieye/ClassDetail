import { describe, it, expect } from "vitest";
import {
  dashboardGate,
  registrationStatusLabel,
  resolveMembershipView,
  type MembershipInput,
  type MembershipRequestSnapshot,
} from "@/lib/business/membership";
import {
  canLeaveClass,
  canRequestClassChange,
  canValidateRegistration,
  type Actor,
} from "@/lib/business/permissions";

// ---------------------------------------------------------------------------
// Tests — modèle d'affichage de « Paramètres → Ma classe » + verrou d'accès
// au dashboard. Fonctions pures (aucune base, aucun DOM).
// ---------------------------------------------------------------------------

const CLASS_A = "11111111-1111-1111-1111-111111111111";
const CLASS_B = "22222222-2222-2222-2222-222222222222";

function request(overrides: Partial<MembershipRequestSnapshot> = {}): MembershipRequestSnapshot {
  return {
    id: "r-1",
    classId: CLASS_B,
    previousClassId: null,
    status: "PENDING",
    createdAt: "2026-09-01T10:00:00.000Z",
    decidedAt: null,
    className: "L2 Informatique",
    previousClassName: null,
    ...overrides,
  };
}

function input(overrides: Partial<MembershipInput> = {}): MembershipInput {
  return {
    role: "STUDENT",
    classId: CLASS_A,
    className: "L1 Informatique",
    classLevel: "Licence 1",
    academicYear: "2026-2027",
    memberSince: "2026-09-01T10:00:00.000Z",
    requests: [],
    classes: [
      { id: CLASS_A, name: "L1 Informatique", level: "Licence 1", academicYear: "2026-2027" },
      { id: CLASS_B, name: "L2 Informatique", level: "Licence 2", academicYear: "2026-2027" },
    ],
    ...overrides,
  };
}

describe("dashboardGate — accès au dashboard", () => {
  it("utilisateur SANS classe + demande PENDING → /pending (workflow d'inscription)", () => {
    expect(dashboardGate({ classId: null, latestRequestStatus: "PENDING" })).toBe("pending");
  });

  it("utilisateur SANS classe + demande REJECTED → /register (resoumission)", () => {
    expect(dashboardGate({ classId: null, latestRequestStatus: "REJECTED" })).toBe("register");
  });

  it("utilisateur SANS classe + demande CANCELLED → accès normal (il peut redemander)", () => {
    expect(dashboardGate({ classId: null, latestRequestStatus: "CANCELLED" })).toBeNull();
  });

  it("utilisateur SANS classe + ACCEPTED (il vient de quitter) → accès normal", () => {
    expect(dashboardGate({ classId: null, latestRequestStatus: "ACCEPTED" })).toBeNull();
  });

  it("utilisateur SANS classe + aucune demande → accès normal", () => {
    expect(dashboardGate({ classId: null, latestRequestStatus: null })).toBeNull();
  });

  it("utilisateur AVEC classe + demande de changement PENDING → accès CONSERVÉ", () => {
    expect(dashboardGate({ classId: CLASS_A, latestRequestStatus: "PENDING" })).toBeNull();
  });

  it("utilisateur AVEC classe + demande de changement REJECTED → accès CONSERVÉ", () => {
    expect(dashboardGate({ classId: CLASS_A, latestRequestStatus: "REJECTED" })).toBeNull();
  });

  it("utilisateur AVEC classe + aucune demande → accès normal", () => {
    expect(dashboardGate({ classId: CLASS_A, latestRequestStatus: null })).toBeNull();
  });
});

describe("permissions — départ / demande de classe", () => {
  const student: Actor = { id: "u-1", role: "STUDENT", classId: CLASS_A };
  const studentNoClass: Actor = { id: "u-2", role: "STUDENT", classId: null };
  const delegate: Actor = { id: "u-3", role: "DELEGATE", classId: CLASS_A };
  const admin: Actor = { id: "u-4", role: "ADMIN", classId: null };

  it("un étudiant rattaché peut quitter", () => {
    expect(canLeaveClass(student)).toBe(true);
  });

  it("un étudiant sans classe ne peut pas « quitter » (rien à quitter)", () => {
    expect(canLeaveClass(studentNoClass)).toBe(false);
  });

  it("un délégué ne peut pas quitter (révocation préalable)", () => {
    expect(canLeaveClass(delegate)).toBe(false);
  });

  it("un administrateur ne quitte pas une classe depuis les paramètres", () => {
    expect(canLeaveClass(admin)).toBe(false);
  });

  it("seuls les étudiants demandent à rejoindre / changer de classe", () => {
    expect(canRequestClassChange(student)).toBe(true);
    expect(canRequestClassChange(studentNoClass)).toBe(true);
    expect(canRequestClassChange(delegate)).toBe(false);
    expect(canRequestClassChange(admin)).toBe(false);
  });

  it("le droit de valider reste : ADMIN, ou délégué de la classe demandée", () => {
    const requester: Actor = { id: "u-9", role: "STUDENT", classId: null };
    expect(canValidateRegistration(admin, CLASS_A)).toBe(true);
    expect(canValidateRegistration(delegate, CLASS_A)).toBe(true);
    expect(canValidateRegistration(delegate, CLASS_B)).toBe(false);
    expect(canValidateRegistration(requester, CLASS_A)).toBe(false);
    expect(canValidateRegistration(student, CLASS_A)).toBe(false);
  });
});

describe("resolveMembershipView — états de « Ma classe »", () => {
  it("état CLASS : appartenance active, actions de départ et de changement", () => {
    const view = resolveMembershipView(input());
    expect(view.kind).toBe("CLASS");
    expect(view.className).toBe("L1 Informatique");
    expect(view.memberSince).toBe("2026-09-01T10:00:00.000Z");
    expect(view.canLeave).toBe(true);
    expect(view.canRequestTransfer).toBe(true);
    expect(view.pending).toBeNull();
    expect(view.blockedReason).toBeNull();
  });

  it("la classe actuelle n'est jamais proposée comme destination", () => {
    const view = resolveMembershipView(input());
    expect(view.classOptions.map((c) => c.id)).toEqual([CLASS_B]);
  });

  it("état PENDING_JOIN : aucune classe, demande de rejoindre en attente", () => {
    const view = resolveMembershipView(
      input({ classId: null, className: null, classLevel: null, academicYear: null, memberSince: null, requests: [request()] })
    );
    expect(view.kind).toBe("PENDING_JOIN");
    expect(view.pending?.classId).toBe(CLASS_B);
    expect(view.pending?.previousClassId).toBeNull();
    expect(view.canLeave).toBe(false);
    expect(view.canRequestTransfer).toBe(true);
  });

  it("état PENDING_CHANGE : classe conservée pendant l'attente", () => {
    const view = resolveMembershipView(
      input({ requests: [request({ previousClassId: CLASS_A, previousClassName: "L1 Informatique" })] })
    );
    expect(view.kind).toBe("PENDING_CHANGE");
    expect(view.classId).toBe(CLASS_A);
    expect(view.className).toBe("L1 Informatique");
    expect(view.pending?.previousClassName).toBe("L1 Informatique");
    expect(view.canRequestTransfer).toBe(true);
  });

  it("état NO_CLASS : aucune classe et aucune demande en attente", () => {
    const view = resolveMembershipView(
      input({ classId: null, className: null, classLevel: null, academicYear: null, memberSince: null })
    );
    expect(view.kind).toBe("NO_CLASS");
    expect(view.classOptions).toHaveLength(2);
  });

  it("état ADMIN : aucun rattachement géré depuis les paramètres", () => {
    const view = resolveMembershipView(input({ role: "ADMIN" }));
    expect(view.kind).toBe("ADMIN");
    expect(view.canLeave).toBe(false);
    expect(view.canRequestTransfer).toBe(false);
    expect(view.blockedReason).toBe("ADMIN");
  });

  it("délégué : appartenance affichée mais actions bloquées (rôle à révoquer)", () => {
    const view = resolveMembershipView(input({ role: "DELEGATE" }));
    expect(view.kind).toBe("CLASS");
    expect(view.canLeave).toBe(false);
    expect(view.canRequestTransfer).toBe(false);
    expect(view.blockedReason).toBe("DELEGATE");
  });

  it("demande de changement + rôle de délégué : la demande en attente reste visible", () => {
    const view = resolveMembershipView(
      input({
        role: "DELEGATE",
        requests: [request({ previousClassId: CLASS_A, previousClassName: "L1 Informatique" })],
      })
    );
    expect(view.kind).toBe("PENDING_CHANGE");
    expect(view.canRequestTransfer).toBe(false);
  });

  it("lastDecision reprend la demande tranchée la plus récente", () => {
    const view = resolveMembershipView(
      input({
        requests: [
          request({ id: "r-2", status: "CANCELLED", decidedAt: "2026-09-05T10:00:00.000Z" }),
          request({ id: "r-1", status: "REJECTED", previousClassId: CLASS_A, decidedAt: "2026-09-03T10:00:00.000Z" }),
        ],
      })
    );
    expect(view.pending).toBeNull();
    expect(view.lastDecision).toMatchObject({
      status: "CANCELLED",
      isChange: false,
      decidedAt: "2026-09-05T10:00:00.000Z",
    });
    expect(view.kind).toBe("CLASS");
  });

  it("lastDecision signale un changement lorsque previous_class_id est renseigné", () => {
    const view = resolveMembershipView(
      input({
        requests: [
          request({
            status: "REJECTED",
            previousClassId: CLASS_A,
            previousClassName: "L1 Informatique",
            decidedAt: "2026-09-03T10:00:00.000Z",
          }),
        ],
      })
    );
    expect(view.lastDecision?.isChange).toBe(true);
    expect(view.lastDecision?.className).toBe("L2 Informatique");
  });
});

describe("registrationStatusLabel — libellés français", () => {
  it("couvre tous les statuts du workflow", () => {
    expect(registrationStatusLabel("PENDING")).toBe("En attente de validation");
    expect(registrationStatusLabel("ACCEPTED")).toBe("Acceptée");
    expect(registrationStatusLabel("REJECTED")).toBe("Refusée");
    expect(registrationStatusLabel("CANCELLED")).toBe("Annulée");
  });
});
