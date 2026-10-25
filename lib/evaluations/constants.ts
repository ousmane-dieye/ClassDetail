import type { EvaluationStatus, EvaluationType } from "@/types/database.types";

/**
 * Constantes du module Évaluations — libellés français, jamais dupliqués
 * ailleurs (formulaire, listes, notifications et tests les réutilisent).
 */

export const EVALUATION_TYPE_LABELS: Record<EvaluationType, string> = {
  CC: "Contrôle continu",
  DEVOIR_SURVEILLE: "Devoir surveillé",
  EXAMEN: "Examen",
  RATTRAPAGE: "Rattrapage",
  TP: "TP",
  AUTRE: "Autre évaluation",
};

/** Libellé court (badges de liste). */
export const EVALUATION_TYPE_SHORT_LABELS: Record<EvaluationType, string> = {
  CC: "CC",
  DEVOIR_SURVEILLE: "Devoir surveillé",
  EXAMEN: "Examen",
  RATTRAPAGE: "Rattrapage",
  TP: "TP",
  AUTRE: "Autre",
};

export const EVALUATION_STATUS_LABELS: Record<EvaluationStatus, string> = {
  DRAFT: "Brouillon",
  PUBLISHED: "Publiée",
  CANCELLED: "Annulée",
};

/** Nombre maximum de chapitres par évaluation (garde-fou, jamais obligatoires). */
export const MAX_CHAPTERS = 30;

/** Représentation minimale d'une évaluation pour les vues (déjà filtrées par RLS). */
export interface EvaluationView {
  id: string;
  subjectId: string;
  title: string;
  type: EvaluationType;
  /** Date ISO "YYYY-MM-DD" (fuseau de l'application). */
  date: string;
  /** "HH:MM" ou null si l'heure n'est pas encore connue. */
  startTime: string | null;
  endTime: string | null;
  room: string | null;
  status: EvaluationStatus;
  /** Ancienne date si report postérieur à la publication. */
  rescheduledFrom: string | null;
}

/** Normalise "HH:MM:SS" → "HH:MM" (repli sur la valeur d'origine). */
export function normalizeTime(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.slice(0, 5);
  return /^\d{2}:\d{2}$/.test(trimmed) ? trimmed : null;
}

/** Mappe une ligne brute (EvaluationRow) vers le modèle de vue. */
export function toEvaluationView(row: {
  id: string;
  subject_id: string;
  title: string;
  type: EvaluationType;
  date: string;
  start_time: string | null;
  end_time: string | null;
  room: string | null;
  status: EvaluationStatus;
  rescheduled_from: string | null;
}): EvaluationView {
  return {
    id: row.id,
    subjectId: row.subject_id,
    title: row.title,
    type: row.type,
    date: row.date,
    startTime: normalizeTime(row.start_time),
    endTime: normalizeTime(row.end_time),
    room: row.room,
    status: row.status,
    rescheduledFrom: row.rescheduled_from,
  };
}
