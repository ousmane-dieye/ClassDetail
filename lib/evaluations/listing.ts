/**
 * Logique d'affichage des listes d'évaluations (fonctions pures).
 *
 * Les dates sont en "YYYY-MM-DD" (ISO, fuseau de l'application) : les
 * comparaisons sont lexicographiques, sans calcul de fuseau. Les évaluations
 * annulées restent visibles (les étudiants doivent en être informés).
 */

import type { EvaluationStatus, EvaluationType } from "@/types/database.types";
import type { EvaluationView } from "@/lib/evaluations/constants";

export interface DayGroup {
  /** Date ISO "YYYY-MM-DD" du groupe. */
  date: string;
  items: EvaluationView[];
}

/**
 * Tri chronologique strict :
 *  - date croissante ;
 *  - à date égale : les évaluations horodatées par heure de début, puis
 *    celles sans heure (information encore incomplète).
 * Le tri est déterministe (comparaison sur l'identifiant en dernier recours).
 */
export function compareEvaluationsAsc(a: EvaluationView, b: EvaluationView): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  if (a.startTime && b.startTime) {
    if (a.startTime !== b.startTime) return a.startTime < b.startTime ? -1 : 1;
  } else if (a.startTime) return -1;
  else if (b.startTime) return 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Tri chronologique inverse (évaluations passées : plus récente d'abord). */
export function compareEvaluationsDesc(a: EvaluationView, b: EvaluationView): number {
  return -compareEvaluationsAsc(a, b);
}

/**
 * Sépare les évaluations à venir (dont aujourd'hui) des évaluations passées,
 * chacune triée dans le bon sens.
 */
export function partitionEvaluations(
  evaluations: EvaluationView[],
  todayYmd: string
): { upcoming: EvaluationView[]; past: EvaluationView[] } {
  const upcoming: EvaluationView[] = [];
  const past: EvaluationView[] = [];
  for (const e of evaluations) {
    if (e.date >= todayYmd) upcoming.push(e);
    else past.push(e);
  }
  upcoming.sort(compareEvaluationsAsc);
  past.sort(compareEvaluationsDesc);
  return { upcoming, past };
}

/** Regroupe une liste déjà triée par date ISO, en préservant l'ordre. */
export function groupEvaluationsByDate(sorted: EvaluationView[]): DayGroup[] {
  const groups: DayGroup[] = [];
  const byDate = new Map<string, EvaluationView[]>();
  for (const e of sorted) {
    const list = byDate.get(e.date);
    if (list) list.push(e);
    else byDate.set(e.date, [e]);
  }
  for (const [date, items] of byDate) groups.push({ date, items });
  return groups;
}

export interface EvaluationFilters {
  subjectId?: string;
  type?: EvaluationType | "";
}

/** Filtre matière / type (aucun filtre = liste inchangée). */
export function filterEvaluations(
  evaluations: EvaluationView[],
  filters: EvaluationFilters
): EvaluationView[] {
  return evaluations.filter((e) => {
    if (filters.subjectId && e.subjectId !== filters.subjectId) return false;
    if (filters.type && e.type !== filters.type) return false;
    return true;
  });
}

/** Vrai si l'évaluation est dans un état « à venir » informative (publiée ou annulée). */
export function isVisibleToStudents(status: EvaluationStatus): boolean {
  return status !== "DRAFT";
}

/**
 * Prochaines évaluations pour les tableaux de bord : publiées et non
 * annulées, à partir d'aujourd'hui, triées chronologiquement, tronquées.
 */
export function nextEvaluations(
  evaluations: EvaluationView[],
  todayYmd: string,
  limit = 3
): EvaluationView[] {
  return evaluations
    .filter((e) => e.date >= todayYmd && e.status === "PUBLISHED")
    .sort(compareEvaluationsAsc)
    .slice(0, limit);
}
