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
