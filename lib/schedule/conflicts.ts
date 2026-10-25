/**
 * Détection de conflits d'emploi du temps.
 *
 * Deux séances d'une même classe sont incompatiles si elles portent sur le
 * même jour de semaine, des plages horaires qui se chevauchent STRICTEMENT
 * (fin == début n'est pas un chevauchement) et des périodes de validité qui
 * se croisent (bornes inclusives).
 *
 * La même règle est garantie en base par la contrainte d'exclusion GiST
 * `schedule_sessions_no_overlap` (migration 0016) : cette fonction sert de
 * pré-détecteur pour renvoyer un message clair avant l'erreur SQL 23P01.
 */

import { timeToMinutes } from "@/lib/schedule/dates";

export interface ConflictCandidate {
  /** Identifiant à exclure du comparaison (édition d'une séance existante). */
  excludeSessionId?: string | null;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  validFrom: string;
  validUntil: string | null;
}

export interface ExistingSession {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  validFrom: string;
  validUntil: string | null;
}

/** Les deux plages horaires (en minutes) se chevauchent strictement. */
export function timeRangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/** Les périodes de validité (ISO, bornes inclusives) se croisent. */
export function validityRangesOverlap(
  aFrom: string,
  aUntil: string | null,
  bFrom: string,
  bUntil: string | null
): boolean {
  const aEnd = aUntil ?? "9999-12-31";
  const bEnd = bUntil ?? "9999-12-31";
  return aFrom <= bEnd && bFrom <= aEnd;
}

/** Vrai si les deux séances sont incompatibles (même classe, même semaine). */
export function sessionsConflict(a: ConflictCandidate, b: ExistingSession): boolean {
  if (a.dayOfWeek !== b.dayOfWeek) return false;
  if (!timeRangesOverlap(timeToMinutes(a.startTime), timeToMinutes(a.endTime), timeToMinutes(b.startTime), timeToMinutes(b.endTime))) {
    return false;
  }
  return validityRangesOverlap(a.validFrom, a.validUntil, b.validFrom, b.validUntil);
}

/**
 * Retourne la première séance existante en conflit avec la candidate,
 * ou null. `excludeSessionId` sert à ignorer la séance éditée elle-même.
 */
export function findConflict(
  candidate: ConflictCandidate,
  existing: ExistingSession[]
): ExistingSession | null {
  for (const s of existing) {
    if (candidate.excludeSessionId && s.id === candidate.excludeSessionId) continue;
    if (sessionsConflict(candidate, s)) return s;
  }
  return null;
}

/** Message d'erreur clair et sûr (aucune donnée sensible). */
export function conflictMessage(): string {
  return "Cette séance chevauche une séance existante de la classe (même jour, horaires ou période de validité qui se croisent).";
}
