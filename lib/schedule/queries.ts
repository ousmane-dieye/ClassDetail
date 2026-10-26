/**
 * Lectures serveur du module Emploi du temps.
 * Utilisé par la page /dashboard/schedule et la carte « Aujourd'hui ».
 * Les filtres RLS sont toujours appliqués (client utilisateur).
 */

import { createClient } from "@/lib/supabase/server";
import type { ScheduleExceptionRow, ScheduleSessionRow } from "@/types/database.types";
import type { SessionException, SessionRecurrence } from "@/lib/schedule/occurrences";
import { resolveClassSubjectColors } from "@/lib/constants/subjectColors";

export interface SubjectLite {
  id: string;
  name: string;
  colorKey: string;
}

export interface ScheduleSnapshot {
  sessions: SessionRecurrence[];
  exceptions: SessionException[];
  subjects: SubjectLite[];
}

/**
 * Colonnes réellement chargées par les `.select(...)` ci-dessous — un sous-ensemble
 * de `ScheduleSessionRow` / `ScheduleExceptionRow` (sans colonnes techniques
 * `created_*` / `updated_*` non sélectionnées).
 */
type SessionSelectRow = Pick<
  ScheduleSessionRow,
  | "id"
  | "class_id"
  | "subject_id"
  | "day_of_week"
  | "start_time"
  | "end_time"
  | "room"
  | "teacher"
  | "valid_from"
  | "valid_until"
  | "status"
>;

type ExceptionSelectRow = Pick<
  ScheduleExceptionRow,
  | "id"
  | "session_id"
  | "class_id"
  | "date"
  | "is_cancelled"
  | "new_start_time"
  | "new_end_time"
  | "new_room"
  | "new_subject_id"
  | "note"
>;

function toRecurrence(row: SessionSelectRow): SessionRecurrence {
  return {
    id: row.id,
    classId: row.class_id,
    subjectId: row.subject_id,
    dayOfWeek: row.day_of_week,
    startTime: row.start_time,
    endTime: row.end_time,
    room: row.room,
    teacher: row.teacher,
    validFrom: row.valid_from,
    validUntil: row.valid_until,
    status: row.status,
  };
}

function toException(row: ExceptionSelectRow): SessionException {
  return {
    id: row.id,
    sessionId: row.session_id,
    date: row.date,
    isCancelled: row.is_cancelled,
    newStartTime: row.new_start_time,
    newEndTime: row.new_end_time,
    newRoom: row.new_room,
    newSubjectId: row.new_subject_id,
    note: row.note,
  };
}

/**
 * Charge le snapshot d'emploi du temps d'une classe.
 * - `fromYmd` : borne basse des exceptions chargées (aujourd'hui - 7 j par défaut,
 *   pour afficher les annulations récentes sans surcharger).
 * - Les brouillons sont visibles ici (délegués/admins) ; les vues étudiantes
 *   les filtrent via `includeDrafts: false` à l'expansion.
 */
export async function getScheduleSnapshot(
  classId: string,
  options: { exceptionsFromYmd?: string } = {}
): Promise<{ snapshot: ScheduleSnapshot; error?: string }> {
  if (!classId) return { snapshot: { sessions: [], exceptions: [], subjects: [] }, error: "Classe introuvable." };

  const supabase = createClient();
  const [sessionsRes, exceptionsRes, subjectsRes] = await Promise.all([
    supabase
      .from("schedule_sessions")
      .select(
        "id, class_id, subject_id, day_of_week, start_time, end_time, room, teacher, valid_from, valid_until, status"
      )
      .eq("class_id", classId)
      .order("day_of_week", { ascending: true })
      .order("start_time", { ascending: true }),
    options.exceptionsFromYmd
      ? supabase
          .from("schedule_session_exceptions")
          .select(
            "id, session_id, class_id, date, is_cancelled, new_start_time, new_end_time, new_room, new_subject_id, note"
          )
          .eq("class_id", classId)
          .gte("date", options.exceptionsFromYmd)
      : supabase
          .from("schedule_session_exceptions")
          .select(
            "id, session_id, class_id, date, is_cancelled, new_start_time, new_end_time, new_room, new_subject_id, note"
          )
          .eq("class_id", classId),
    supabase.from("subjects").select("id, name, color_key").eq("class_id", classId).order("name"),
  ]);

  if (sessionsRes.error) {
    return { snapshot: { sessions: [], exceptions: [], subjects: [] }, error: "Chargement de l'emploi du temps impossible." };
  }

  const rawSubjects = (subjectsRes.data ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    colorKey: s.color_key,
  }));

  return {
    snapshot: {
      sessions: (sessionsRes.data ?? []).map(toRecurrence),
      exceptions: (exceptionsRes.data ?? []).map(toException),
      subjects: resolveClassSubjectColors(rawSubjects),
    },
  };
}

/** Vrai si la classe a au moins une séance publiée (distingue « rien publié » de « aucun cours »). */
export async function hasPublishedSchedule(classId: string): Promise<boolean> {
  if (!classId) return false;
  const supabase = createClient();
  const { count } = await supabase
    .from("schedule_sessions")
    .select("id", { count: "exact", head: true })
    .eq("class_id", classId)
    .eq("status", "PUBLISHED");
  return (count ?? 0) > 0;
}
