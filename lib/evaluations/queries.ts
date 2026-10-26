/**
 * Lectures serveur du module Évaluations.
 * Utilisées par la page /dashboard/evaluations, la page de détail et la
 * carte « Prochaines évaluations ». Les filtres RLS sont toujours appliqués
 * (client utilisateur) : un étudiant ne reçoit jamais un brouillon.
 */

import { createClient } from "@/lib/supabase/server";
import type { EvaluationRow, HintType } from "@/types/database.types";
import { toEvaluationView, type EvaluationView } from "@/lib/evaluations/constants";
import { getZonedNow } from "@/lib/schedule/dates";
import { resolveClassSubjectColors } from "@/lib/constants/subjectColors";

export interface SubjectLite {
  id: string;
  name: string;
  colorKey: string;
}

export interface EvaluationsSnapshot {
  evaluations: EvaluationView[];
  subjects: SubjectLite[];
}

/**
 * Snapshot des évaluations d'une classe (liste).
 * Deux requêtes indépendantes parallélisées, sans jointure PostgREST
 * (convention du projet : typage strict, mappeage manuel).
 */
export async function getEvaluationsSnapshot(
  classId: string
): Promise<{ snapshot: EvaluationsSnapshot; error?: string }> {
  const empty: EvaluationsSnapshot = { evaluations: [], subjects: [] };
  if (!classId) return { snapshot: empty, error: "Classe introuvable." };

  const supabase = createClient();
  const [evaluationsRes, subjectsRes] = await Promise.all([
    supabase
      .from("evaluations")
      .select(
        "id, subject_id, title, type, date, start_time, end_time, room, status, rescheduled_from"
      )
      .eq("class_id", classId)
      .order("date", { ascending: true })
      .order("start_time", { ascending: true, nullsFirst: false })
      .limit(300),
    supabase.from("subjects").select("id, name, color_key").eq("class_id", classId).order("name"),
  ]);

  if (evaluationsRes.error) {
    return { snapshot: empty, error: "Chargement des évaluations impossible." };
  }

  const rawSubjects = (subjectsRes.data ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    colorKey: s.color_key,
  }));

  return {
    snapshot: {
      evaluations: (evaluationsRes.data ?? []).map((row) => toEvaluationView(row)),
      subjects: resolveClassSubjectColors(rawSubjects),
    },
  };
}

export interface LinkedDocument {
  id: string;
  title: string;
  driveUrl: string;
  subjectId: string;
}

export interface LinkedHint {
  id: string;
  title: string;
  year: string;
  type: HintType;
  driveUrl: string;
  subjectId: string;
}

export interface EvaluationDetail extends EvaluationView {
  classId: string;
  description: string | null;
  chapters: string[];
  cancellationNote: string | null;
  createdAt: string;
  updatedAt: string;
  subjectName: string;
  subjectColorKey: string;
}

/**
 * Détail d'une évaluation. RLS appliquée : renvoie null si l'évaluation
 * n'existe pas ou n'est pas visible par l'utilisateur (brouillon d'une
 * autre classe, etc.) — la page répond alors 404.
 */
export async function getEvaluationDetail(
  evaluationId: string
): Promise<{ detail: EvaluationDetail | null; documents: LinkedDocument[]; hints: LinkedHint[] }> {
  const supabase = createClient();

  const { data: row } = await supabase
    .from("evaluations")
    .select(
      "id, class_id, subject_id, title, type, description, date, start_time, end_time, room, chapters, status, rescheduled_from, cancellation_note, created_at, updated_at"
    )
    .eq("id", evaluationId)
    .maybeSingle();

  if (!row) return { detail: null, documents: [], hints: [] };

  const typedRow = row as EvaluationRow;
  const [subjectRes, docLinksRes, hintLinksRes] = await Promise.all([
    supabase.from("subjects").select("id, name, color_key").eq("id", typedRow.subject_id).maybeSingle(),
    supabase.from("evaluation_documents").select("document_id").eq("evaluation_id", evaluationId),
    supabase.from("evaluation_hints").select("hint_id").eq("evaluation_id", evaluationId),
  ]);

  const documentIds = (docLinksRes.data ?? []).map((l) => l.document_id);
  const hintIds = (hintLinksRes.data ?? []).map((l) => l.hint_id);

  const [documentsRes, hintsRes] = await Promise.all([
    documentIds.length > 0
      ? supabase
          .from("documents")
          .select("id, title, drive_url, subject_id")
          .in("id", documentIds)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as Array<Record<string, never>> }),
    hintIds.length > 0
      ? supabase
          .from("hints")
          .select("id, title, year, type, drive_url, subject_id")
          .in("id", hintIds)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as Array<Record<string, never>> }),
  ]);

  const view = toEvaluationView(typedRow);
  const detail: EvaluationDetail = {
    ...view,
    classId: typedRow.class_id,
    description: typedRow.description,
    chapters: typedRow.chapters ?? [],
    cancellationNote: typedRow.cancellation_note,
    createdAt: typedRow.created_at,
    updatedAt: typedRow.updated_at,
    subjectName: subjectRes.data?.name ?? "Matière",
    subjectColorKey: subjectRes.data?.color_key ?? "blue",
  };

  return {
    detail,
    documents: ((documentsRes.data ?? []) as Array<{
      id: string;
      title: string;
      drive_url: string;
      subject_id: string;
    }>).map((d) => ({ id: d.id, title: d.title, driveUrl: d.drive_url, subjectId: d.subject_id })),
    hints: ((hintsRes.data ?? []) as Array<{
      id: string;
      title: string;
      year: string;
      type: HintType;
      drive_url: string;
      subject_id: string;
    }>).map((h) => ({
      id: h.id,
      title: h.title,
      year: h.year,
      type: h.type,
      driveUrl: h.drive_url,
      subjectId: h.subject_id,
    })),
  };
}

export interface ClassResourceDocument {
  id: string;
  title: string;
  subjectId: string;
  createdAt: string;
}

export interface ClassResourceHint {
  id: string;
  title: string;
  year: string;
  type: HintType;
  subjectId: string;
  createdAt: string;
}

/** Pool de ressources de la classe (délégués/admins, gestion des associations). */
export async function getClassResources(
  classId: string
): Promise<{ documents: ClassResourceDocument[]; hints: ClassResourceHint[] }> {
  const supabase = createClient();
  const [documentsRes, hintsRes] = await Promise.all([
    supabase
      .from("documents")
      .select("id, title, subject_id, created_at")
      .eq("class_id", classId)
      .order("created_at", { ascending: false })
      .limit(150),
    supabase
      .from("hints")
      .select("id, title, year, type, subject_id, created_at")
      .eq("class_id", classId)
      .order("created_at", { ascending: false })
      .limit(150),
  ]);

  return {
    documents: (documentsRes.data ?? []).map((d) => ({
      id: d.id,
      title: d.title,
      subjectId: d.subject_id,
      createdAt: d.created_at,
    })),
    hints: (hintsRes.data ?? []).map((h) => ({
      id: h.id,
      title: h.title,
      year: h.year,
      type: h.type as HintType,
      subjectId: h.subject_id,
      createdAt: h.created_at,
    })),
  };
}

/**
 * Évaluations publiées à venir d'une classe — carte « Prochaines
 * évaluations » (dashboards, bandeau emploi du temps). Visibilité RLS
 * identique à la liste : un étudiant ne voit jamais un brouillon.
 */
export interface UpcomingEvaluation extends EvaluationView {
  subjectName: string;
  subjectColorKey: string;
}

export async function getUpcomingEvaluationsForClass(
  classId: string,
  limit = 4
): Promise<UpcomingEvaluation[]> {
  if (!classId) return [];
  const supabase = createClient();
  const todayYmd = getZonedNow().todayYmd;

  const [evaluationsRes, subjectsRes] = await Promise.all([
    supabase
      .from("evaluations")
      .select("id, subject_id, title, type, date, start_time, end_time, room, status, rescheduled_from")
      .eq("class_id", classId)
      .eq("status", "PUBLISHED")
      .gte("date", todayYmd)
      .order("date", { ascending: true })
      .order("start_time", { ascending: true, nullsFirst: false })
      .limit(limit),
    supabase.from("subjects").select("id, name, color_key").eq("class_id", classId),
  ]);

  const resolvedSubjects = resolveClassSubjectColors(
    (subjectsRes.data ?? []).map((s) => ({ id: s.id, name: s.name, colorKey: s.color_key }))
  );
  const subjectNames: Record<string, string> = {};
  const subjectColors: Record<string, string> = {};
  for (const s of resolvedSubjects) {
    subjectNames[s.id] = s.name;
    subjectColors[s.id] = s.colorKey;
  }

  return (evaluationsRes.data ?? []).map((row) => ({
    ...toEvaluationView(row),
    subjectName: subjectNames[row.subject_id] ?? "Matière",
    subjectColorKey: subjectColors[row.subject_id] ?? "blue",
  }));
}
