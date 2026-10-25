import type { UserRole } from "@/types/database.types";

/**
 * Matrice de permissions centralisée. Utilisée côté UI pour l'affichage
 * conditionnel (jamais comme seule barrière de sécurité — RLS fait foi).
 */

export interface Actor {
  id: string;
  role: UserRole;
  classId: string | null;
}

export function canCreateTask(actor: Actor, classId: string): boolean {
  if (actor.role === "ADMIN") return true;
  return actor.role === "DELEGATE" && actor.classId === classId;
}

export function canManageTask(actor: Actor, classId: string): boolean {
  return canCreateTask(actor, classId);
}

export function canDeleteResource(
  actor: Actor,
  resourceClassId: string,
  resourceAuthorId: string
): boolean {
  if (actor.role === "ADMIN") return true;
  if (actor.role === "DELEGATE" && actor.classId === resourceClassId) return true;
  return actor.id === resourceAuthorId;
}

export function canManageRecordings(actor: Actor, classId: string): boolean {
  if (actor.role === "ADMIN") return true;
  return actor.role === "DELEGATE" && actor.classId === classId;
}

export function canModerateChat(actor: Actor, classId: string): boolean {
  if (actor.role === "ADMIN") return true;
  return actor.role === "DELEGATE" && actor.classId === classId;
}

export function canValidateRegistration(actor: Actor, classId: string): boolean {
  if (actor.role === "ADMIN") return true;
  return actor.role === "DELEGATE" && actor.classId === classId;
}

export function canManageClasses(actor: Actor): boolean {
  return actor.role === "ADMIN";
}

export function canAppointDelegate(actor: Actor): boolean {
  return actor.role === "ADMIN";
}

export function canViewClassStats(actor: Actor, classId: string): boolean {
  if (actor.role === "ADMIN") return true;
  return actor.role === "DELEGATE" && actor.classId === classId;
}

/** Emploi du temps : création / édition / suppression de séances. */
export function canManageSchedule(actor: Actor, classId: string): boolean {
  if (actor.role === "ADMIN") return true;
  return actor.role === "DELEGATE" && actor.classId === classId;
}

/** Publication (brouillon → officiel) et exceptions datées. */
export function canPublishSchedule(actor: Actor, classId: string): boolean {
  return canManageSchedule(actor, classId);
}

/** Couleur d'une matière : délégué de la classe ou admin (jamais étudiant). */
export function canManageSubjectColor(actor: Actor, classId: string): boolean {
  return canManageSchedule(actor, classId);
}

/** Évaluations : création / édition / publication / annulation / suppression. */
export function canManageEvaluations(actor: Actor, classId: string): boolean {
  if (actor.role === "ADMIN") return true;
  return actor.role === "DELEGATE" && actor.classId === classId;
}

/** Association de ressources de révision à une évaluation. */
export function canManageEvaluationResources(actor: Actor, classId: string): boolean {
  return canManageEvaluations(actor, classId);
}

/**
 * Paramètres → Ma classe (migration 0019).
 * Règles d'affichage — elles sont RÉAPPLIQUÉES côté base par
 * `classpulse_leave_class` / `classpulse_request_class_change` (jamais une
 * seule barrière UI) :
 *   - ADMIN    : compte global, jamais géré depuis les paramètres ;
 *   - DELEGATE : responsable de classe → révocation préalable exigée ;
 *   - STUDENT  : départ possible uniquement s'il appartient à une classe.
 */
export function canLeaveClass(actor: Actor): boolean {
  return actor.role === "STUDENT" && actor.classId !== null;
}

/** Demande de rejoindre (sans classe) ou de changer de classe. */
export function canRequestClassChange(actor: Actor): boolean {
  return actor.role === "STUDENT";
}
