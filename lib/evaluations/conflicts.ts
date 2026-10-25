/**
 * Détection de conflits du module Évaluations (fonctions pures).
 *
 * Une évaluation peut être créée sans heure : aucun conflit n'est alors
 * détectable, ce qui n'est PAS une erreur (information incomplète, courante).
 * Les conflits sont uniquement des AVERTISSEMENTS explicites — ils ne
 * bloquent jamais la publication (contrairement au GiST de l'emploi du
 * temps, où deux cours au même créneau sont structurellement incompatibles).
 */

import { minutesToTime, timeToMinutes } from "@/lib/schedule/dates";
import { timeRangesOverlap } from "@/lib/schedule/conflicts";
import {
  occurrenceFor,
  sessionOccursOn,
  type SessionException,
  type SessionRecurrence,
} from "@/lib/schedule/occurrences";

export interface EvaluationTiming {
  id?: string | null;
  /** Date ISO "YYYY-MM-DD". */
  date: string;
  /** "HH:MM[:SS]" ou null (information inconnue). */
  startTime: string | null;
  endTime: string | null;
  /** Présent si connu (messages). */
  title?: string;
  status?: string;
}

/** Vrai si l'évaluation porte une plage horaire complète (début ET fin). */
export function hasCompleteTimes(e: Pick<EvaluationTiming, "startTime" | "endTime">): boolean {
  return Boolean(e.startTime && e.endTime);
}

/** Les deux évaluations (même date, plages complètes) se chevauchent strictement. */
export function evaluationTimingsOverlap(a: EvaluationTiming, b: EvaluationTiming): boolean {
  if (a.date !== b.date) return false;
  if (!hasCompleteTimes(a) || !hasCompleteTimes(b)) return false;
  return timeRangesOverlap(
    timeToMinutes(a.startTime as string),
    timeToMinutes(a.endTime as string),
    timeToMinutes(b.startTime as string),
    timeToMinutes(b.endTime as string)
  );
}

/**
 * Première évaluation existante en conflit avec la candidate, ou null.
 * Les évaluations annulées n'entrent pas en compte (elles n'ont plus
 * d'effet) ; `excludeId` ignore l'évaluation éditée elle-même.
 */
export function findEvaluationConflict(
  candidate: EvaluationTiming,
  existing: EvaluationTiming[]
): EvaluationTiming | null {
  for (const e of existing) {
    if (candidate.id && e.id === candidate.id) continue;
    if (e.status === "CANCELLED") continue;
    if (evaluationTimingsOverlap(candidate, e)) return e;
  }
  return null;
}

export interface ScheduleConflict {
  sessionId: string;
  subjectId: string;
  /** Heure effective (exception datée appliquée le cas échéant). */
  startTime: string;
  endTime: string;
  room: string | null;
}

/**
 * Cours de l'emploi du temps (séances récurrentes + exceptions datées)
 * qui chevauchent l'évaluation candidate à sa date. Les séances annulées
 * par une exception sont ignorées ; les séances sans horaire complet ne
 * peuvent pas être comparées (données jamais supposées complètes).
 */
export function findScheduleConflictsOnDate(
  candidate: EvaluationTiming,
  sessions: SessionRecurrence[],
  exceptions: SessionException[]
): ScheduleConflict[] {
  if (!hasCompleteTimes(candidate)) return [];

  const conflicts: ScheduleConflict[] = [];
  for (const session of sessions) {
    if (!sessionOccursOn(session, candidate.date)) continue;
    const exception =
      exceptions.find((e) => e.sessionId === session.id && e.date === candidate.date) ?? null;
    const occurrence = occurrenceFor(session, candidate.date, exception);
    if (occurrence.cancelled) continue;
    if (
      timeRangesOverlap(
        timeToMinutes(candidate.startTime as string),
        timeToMinutes(candidate.endTime as string),
        occurrence.startMinutes,
        occurrence.endMinutes
      )
    ) {
      conflicts.push({
        sessionId: session.id,
        subjectId: occurrence.subjectId,
        startTime: minutesToTime(occurrence.startMinutes),
        endTime: minutesToTime(occurrence.endMinutes),
        room: occurrence.room,
      });
    }
  }
  return conflicts;
}

/**
 * Avertissements lisibles pour une évaluation candidate (non bloquants).
 * `subjectNames` : map subjectId → nom (messages).
 */
export function evaluationConflictWarnings(
  candidate: EvaluationTiming,
  existing: EvaluationTiming[],
  sessions: SessionRecurrence[],
  exceptions: SessionException[],
  subjectNames: Record<string, string>
): string[] {
  const warnings: string[] = [];

  const clash = findEvaluationConflict(candidate, existing);
  if (clash) {
    const label = clash.title ? `« ${clash.title} »` : "une autre évaluation";
    warnings.push(`Chevauchement possible avec ${label} prévue le même jour.`);
  }

  for (const c of findScheduleConflictsOnDate(candidate, sessions, exceptions)) {
    const subject = subjectNames[c.subjectId] ?? "Un cours";
    warnings.push(`Chevauchement avec le cours de ${subject} (${c.startTime}–${c.endTime}).`);
  }

  return warnings;
}
