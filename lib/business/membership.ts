/**
 * Paramètres → Ma classe — modèle d'affichage (PUR, sans accès base ni React).
 *
 * Centralise les deux décisions qui doivent rester identiques partout :
 *   1. `dashboardGate` : doit-on rediriger un utilisateur hors du dashboard ?
 *      NON dès qu'il possède une classe : une demande de changement en attente
 *      (PENDING) ou refusée (REJECTED) ne doit jamais le renvoyer vers
 *      /pending ou /register — il conserve sa classe actuelle.
 *   2. `resolveMembershipView` : quel état afficher dans
 *      « Dashboard → Paramètres → Ma classe ».
 *
 * ⚠️ Côté UI uniquement : les règles sont réappliquées dans la base
 * (`classpulse_leave_class`, `classpulse_request_class_change`,
 * `classpulse_decide_request`) et par les Server Actions correspondantes.
 */

import type { RegistrationStatus, UserRole } from "@/types/database.types";
import {
  canLeaveClass,
  canRequestClassChange,
  type Actor,
} from "@/lib/business/permissions";

/** Résultat d'une Server Action d'appartenance (succès ou message d'erreur). */
export type MembershipActionResult = { success: true } | { error: string };

export type ClassOption = {
  id: string;
  name: string;
  level: string;
  academicYear: string;
};

export type MembershipRequestSnapshot = {
  id: string;
  classId: string;
  previousClassId: string | null;
  status: RegistrationStatus;
  createdAt: string;
  decidedAt: string | null;
  /** Classe visée (jointure échouée → null). */
  className: string | null;
  /** Classe de départ d'une demande de changement. */
  previousClassName: string | null;
};

export type DecidedStatus = Exclude<RegistrationStatus, "PENDING">;

export type MembershipViewKind =
  /** Administrateur global : aucun rattachement géré ici. */
  | "ADMIN"
  /** Demande de changement en attente (classe actuelle conservée). */
  | "PENDING_CHANGE"
  /** Demande de rejoindre en attente (aucune classe). */
  | "PENDING_JOIN"
  /** Appartenance active, aucune demande en attente. */
  | "CLASS"
  /** Aucune classe et aucune demande en attente. */
  | "NO_CLASS";

/** Raison d'une action indisponible (affichée à l'utilisateur). */
export type MembershipBlockedReason = "ADMIN" | "DELEGATE" | null;

export type MembershipView = {
  kind: MembershipViewKind;
  role: UserRole;
  actor: Actor;
  classId: string | null;
  className: string | null;
  classLevel: string | null;
  academicYear: string | null;
  /** Date d'ouverture de l'appartenance active (table class_members). */
  memberSince: string | null;
  pending: MembershipRequestSnapshot | null;
  /** Dernière demande tranchée (ACCEPTED / REJECTED / CANCELLED). */
  lastDecision: {
    status: DecidedStatus;
    className: string | null;
    previousClassName: string | null;
    decidedAt: string | null;
    isChange: boolean;
  } | null;
  canLeave: boolean;
  canRequestTransfer: boolean;
  blockedReason: MembershipBlockedReason;
  /** Classes proposables (la classe actuelle en est exclue). */
  classOptions: ClassOption[];
};

export type MembershipInput = {
  role: UserRole;
  classId: string | null;
  className: string | null;
  classLevel: string | null;
  academicYear: string | null;
  memberSince: string | null;
  /** Demandes de l'utilisateur, la plus récente en premier. */
  requests: MembershipRequestSnapshot[];
  classes: ClassOption[];
};

/** Verrou d'accès au dashboard : null = accès normal. */
export type DashboardGate = "pending" | "register" | null;

/**
 * Un utilisateur SANS classe peut être renvoyé vers le workflow d'inscription
 * (demande en attente → /pending ; refusée → /register pour resoumission).
 *
 * Un utilisateur AVEC classe garde TOUJOURS accès au dashboard : son statut de
 * demande (changement en attente ou refusé) n'est pas un motif d'exclusion —
 * il en découle l'état affiché dans Paramètres → Ma classe.
 */
export function dashboardGate(input: {
  classId: string | null;
  latestRequestStatus: RegistrationStatus | null;
}): DashboardGate {
  if (input.classId) return null;
  if (input.latestRequestStatus === "PENDING") return "pending";
  if (input.latestRequestStatus === "REJECTED") return "register";
  return null;
}

export function resolveMembershipView(input: MembershipInput): MembershipView {
  const actor: Actor = { id: "", role: input.role, classId: input.classId };
  const pending = input.requests.find((r) => r.status === "PENDING") ?? null;
  const decided = input.requests.find((r) => r.status !== "PENDING") ?? null;

  const blockedReason: MembershipBlockedReason =
    input.role === "ADMIN" ? "ADMIN" : input.role === "DELEGATE" ? "DELEGATE" : null;

  let kind: MembershipViewKind;
  if (input.role === "ADMIN") kind = "ADMIN";
  else if (pending && pending.previousClassId) kind = "PENDING_CHANGE";
  else if (pending) kind = "PENDING_JOIN";
  else if (input.classId) kind = "CLASS";
  else kind = "NO_CLASS";

  return {
    kind,
    role: input.role,
    actor,
    classId: input.classId,
    className: input.className,
    classLevel: input.classLevel,
    academicYear: input.academicYear,
    memberSince: input.memberSince,
    pending,
    lastDecision:
      decided && decided.status !== "PENDING"
        ? {
            status: decided.status,
            className: decided.className,
            previousClassName: decided.previousClassName,
            decidedAt: decided.decidedAt,
            isChange: decided.previousClassId !== null,
          }
        : null,
    canLeave: canLeaveClass(actor),
    canRequestTransfer: canRequestClassChange(actor),
    blockedReason,
    classOptions: input.classes.filter((c) => c.id !== input.classId),
  };
}

/** Libellé français d'un statut de demande (affichage unique). */
export function registrationStatusLabel(status: RegistrationStatus): string {
  switch (status) {
    case "PENDING":
      return "En attente de validation";
    case "ACCEPTED":
      return "Acceptée";
    case "REJECTED":
      return "Refusée";
    case "CANCELLED":
      return "Annulée";
    default:
      return status;
  }
}
