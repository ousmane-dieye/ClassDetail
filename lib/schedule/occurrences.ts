/**
 * Moteur d'occurrences : expansion des séances récurrentes + exceptions
 * datées en séances concrètes affichables.
 *
 * Fonctions pures (aucune dépendance Supabase/React) — testées sous Node.
 * Les horaires sont en minutes depuis minuit local (fuseau de l'application),
 * les dates en "YYYY-MM-DD".
 */

import {
  addDaysYmd,
  isoDayOfWeek,
  timeToMinutes,
  weekDaysYmd,
  ymdGte,
  ymdLte,
} from "@/lib/schedule/dates";

export interface SessionRecurrence {
  id: string;
  classId: string;
  subjectId: string;
  /** Jour ISO : 1 = lundi … 7 = dimanche. */
  dayOfWeek: number;
  /** "HH:MM[:SS]" heure locale. */
  startTime: string;
  endTime: string;
  room: string | null;
  teacher: string | null;
  /** Date ISO de début de validité. */
  validFrom: string;
  /** Date ISO de fin de validité (inclusive), ou null = illimitée. */
  validUntil: string | null;
  status: "DRAFT" | "PUBLISHED";
}

export interface SessionException {
  id: string;
  sessionId: string;
  date: string;
  isCancelled: boolean;
  newStartTime: string | null;
  newEndTime: string | null;
  newRoom: string | null;
  newSubjectId: string | null;
  note: string | null;
}

/** Type d'une occurrence affichable. */
export type OccurrenceKind = "normal" | "cancelled" | "moved" | "room_changed" | "replaced" | "moved_room";

export interface Occurrence {
  /** Identifiant stable (sessionId:date) — clé de rendu React. */
  key: string;
  sessionId: string;
  exceptionId: string | null;
  date: string;
  dayOfWeek: number;
  startMinutes: number;
  endMinutes: number;
  subjectId: string;
  room: string | null;
  teacher: string | null;
  cancelled: boolean;
  kind: OccurrenceKind;
  note: string | null;
  status: "DRAFT" | "PUBLISHED";
}

/** La règle récurrente s'applique-elle à la date donnée ? */
export function sessionOccursOn(session: SessionRecurrence, date: string): boolean {
  if (session.dayOfWeek !== isoDayOfWeek(date)) return false;
  if (!ymdLte(session.validFrom, date)) return false;
  if (session.validUntil !== null && !ymdGte(session.validUntil, date)) return false;
  return true;
}

function kindOf(exc: SessionException | undefined): OccurrenceKind {
  if (!exc) return "normal";
  if (exc.isCancelled) return "cancelled";
  const moved =
    exc.newStartTime !== null || exc.newEndTime !== null;
  const roomChanged = exc.newRoom !== null;
  if (moved && roomChanged) return "moved_room";
  if (moved) return "moved";
  if (exc.newSubjectId !== null) return "replaced";
  return "room_changed";
}

/** Construit l'occurrence effective pour une date (exception appliquée). */
export function occurrenceFor(
  session: SessionRecurrence,
  date: string,
  exception: SessionException | null
): Occurrence {
  const exc = exception ?? undefined;
  const start = timeToMinutes(exc?.newStartTime ?? session.startTime);
  const end = timeToMinutes(exc?.newEndTime ?? session.endTime);
  return {
    key: `${session.id}:${date}`,
    sessionId: session.id,
    exceptionId: exc?.id ?? null,
    date,
    dayOfWeek: isoDayOfWeek(date),
    startMinutes: start,
    endMinutes: end,
    subjectId: exc?.newSubjectId ?? session.subjectId,
    room: exc?.newRoom !== undefined && exc?.newRoom !== null ? exc.newRoom : session.room,
    teacher: session.teacher,
    cancelled: exc?.isCancelled === true,
    kind: kindOf(exc),
    note: exc?.note ?? null,
    status: session.status,
  };
}

export interface ExpandOptions {
  /** Inclure les brouillons (délégués/admins uniquement — RLS déjà appliquée en amont). */
  includeDrafts?: boolean;
  /** Date du jour (pour masquer les exceptions passées ? non — on les garde pour l'historique visuel). */
}

/**
 * Déplie les règles récurrentes + exceptions sur une semaine (lundi → dimanche).
 * Tri chronologique garanti.
 */
export function expandWeek(
  sessions: SessionRecurrence[],
  exceptions: SessionException[],
  weekStartYmd: string,
  options: ExpandOptions = {}
): Occurrence[] {
  const days = weekDaysYmd(weekStartYmd);
  const excBySessionAndDate = new Map<string, SessionException>();
  for (const exc of exceptions) {
    excBySessionAndDate.set(`${exc.sessionId}:${exc.date}`, exc);
  }

  const result: Occurrence[] = [];
  for (const session of sessions) {
    if (!options.includeDrafts && session.status !== "PUBLISHED") continue;
    for (const date of days) {
      if (!sessionOccursOn(session, date)) continue;
      const exc = excBySessionAndDate.get(`${session.id}:${date}`) ?? null;
      result.push(occurrenceFor(session, date, exc));
    }
  }

  result.sort((a, b) =>
    a.date === b.date ? a.startMinutes - b.startMinutes : a.date < b.date ? -1 : 1
  );
  return result;
}

/** Occurrences d'un seul jour (agenda mobile). */
export function expandDay(
  sessions: SessionRecurrence[],
  exceptions: SessionException[],
  date: string,
  options: ExpandOptions = {}
): Occurrence[] {
  return expandWeek(sessions, exceptions, addDaysYmd(date, 1 - isoDayOfWeek(date)), options).filter(
    (o) => o.date === date
  );
}

/** Regroupe les occurrences par date ISO (7 entrées max pour une semaine). */
export function groupByDate(occurrences: Occurrence[]): Map<string, Occurrence[]> {
  const map = new Map<string, Occurrence[]>();
  for (const o of occurrences) {
    const list = map.get(o.date);
    if (list) list.push(o);
    else map.set(o.date, [o]);
  }
  return map;
}

/** Prochaine occurrence (non annulée) à partir d'une date/heure données. */
export function nextOccurrence(
  occurrences: Occurrence[],
  fromYmd: string,
  fromMinutes: number
): Occurrence | null {
  for (const o of occurrences) {
    if (o.cancelled) continue;
    if (o.date > fromYmd) return o;
    if (o.date === fromYmd && o.startMinutes >= fromMinutes) return o;
  }
  return null;
}

/** Occurrences en cours à l'instant donné. */
export function ongoingOccurrences(
  occurrences: Occurrence[],
  onYmd: string,
  minutes: number
): Occurrence[] {
  return occurrences.filter(
    (o) => !o.cancelled && o.date === onYmd && o.startMinutes <= minutes && minutes < o.endMinutes
  );
}

/** Chevauchement visuel de deux occurrences (pour la colonne de la grille). */
export function overlaps(a: Occurrence, b: Occurrence): boolean {
  return a.date === b.date && a.startMinutes < b.endMinutes && b.startMinutes < a.endMinutes;
}

/**
 * Layout des blocs de la grille hebdomadaire : partage les colonnes entre
 * occurrences qui se chevauchent (heure déplacée par exception, séances
 * consécutives edge-to-edge non concernées).
 * Retourne pour chaque occurrence { key } → { col, cols }.
 */
export function computeOverlapLayout(occurrences: Occurrence[]): Map<string, { col: number; cols: number }> {
  const layout = new Map<string, { col: number; cols: number }>();
  // Par jour : groupes transitifs de chevauchement.
  const byDate = groupByDate(occurrences);
  for (const [, dayOccs] of byDate) {
    const sorted = [...dayOccs].sort((a, b) =>
      a.startMinutes === b.startMinutes ? a.endMinutes - b.endMinutes : a.startMinutes - b.startMinutes
    );
    let cluster: Occurrence[] = [];
    let clusterEnd = -1;
    const flush = () => {
      if (cluster.length === 0) return;
      // Assignation gloutonne en colonnes.
      const colEnds: number[] = [];
      for (const o of cluster) {
        let placed = false;
        for (let c = 0; c < colEnds.length; c++) {
          if ((colEnds[c] ?? -1) <= o.startMinutes) {
            colEnds[c] = o.endMinutes;
            layout.set(o.key, { col: c, cols: 1 });
            placed = true;
            break;
          }
        }
        if (!placed) {
          colEnds.push(o.endMinutes);
          layout.set(o.key, { col: colEnds.length - 1, cols: 1 });
        }
      }
      const total = colEnds.length;
      for (const o of cluster) {
        const entry = layout.get(o.key);
        if (entry) layout.set(o.key, { col: entry.col, cols: total });
      }
      cluster = [];
      clusterEnd = -1;
    };
    for (const o of sorted) {
      if (cluster.length > 0 && o.startMinutes >= clusterEnd) flush();
      cluster.push(o);
      clusterEnd = Math.max(clusterEnd, o.endMinutes);
    }
    flush();
  }
  return layout;
}
