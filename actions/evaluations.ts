"use server";

/**
 * Server Actions du module Évaluations.
 *
 * Sécurité (chaque mutation) :
 *   1. Session vérifiée côté serveur (supabase.auth.getUser()).
 *   2. Validation Zod de TOUTES les entrées (chapitres facultatifs).
 *   3. Rôle vérifié (DELEGATE de la classe ciblée ou ADMIN) — relu dans
 *      `profiles`, jamais depuis une valeur envoyée par le client.
 *   4. Appartenance de l'évaluation à la classe vérifiée avant mutation.
 *   5. La matière doit appartenir à la classe (serveur + FK composite S3).
 *   6. Les ressources associées doivent appartenir à la classe (serveur +
 *      FK composite vers documents/hints (id, class_id)).
 *   7. Conflits = avertissements explicites, JAMAIS bloquants.
 *   8. RLS PostgreSQL en dernière ligne (défense en profondeur).
 *
 * Notifications (système unifié, catégorie « evaluations ») :
 *   - publication d'une évaluation, report (changement de date), modification
 *     matérielle, annulation, retrait d'une évaluation publiée ;
 *   - JAMAIS pour un brouillon, ni pour une édition sans impact (chapitres,
 *     description) ;
 *   - émises uniquement après le succès de l'opération.
 */

import { createClient } from "@/lib/supabase/server";
import {
  evaluationResourcesSchema,
  evaluationSchema,
} from "@/lib/validation/schemas";
import {
  canManageEvaluationResources,
  canManageEvaluations,
} from "@/lib/business/permissions";
import { notifyClassMembers } from "@/lib/notifications/service";
import { getScheduleSnapshot } from "@/lib/schedule/queries";
import { formatYmdLong } from "@/lib/schedule/dates";
import {
  evaluationConflictWarnings,
  type EvaluationTiming,
} from "@/lib/evaluations/conflicts";
import {
  EVALUATION_TYPE_LABELS,
  normalizeTime,
} from "@/lib/evaluations/constants";
import { revalidatePath } from "next/cache";
import type { EvaluationStatus, EvaluationType, UserRole } from "@/types/database.types";

export type EvaluationActionResult =
  | { success: true; id?: string; notified?: number; warnings?: string[] }
  | { error: string };

interface Actor {
  id: string;
  role: UserRole;
  classId: string | null;
}

/** Authentification + profil (rôle relu côté serveur, jamais depuis le client). */
async function requireActor(): Promise<{ actor: Actor } | { error: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Non authentifié" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, class_id")
    .eq("id", user.id)
    .single();
  if (!profile) return { error: "Profil introuvable" };

  return { actor: { id: profile.id, role: profile.role, classId: profile.class_id } };
}

/** Contrôle d'autorisation explicite (message clair ; RLS confirme ensuite). */
function authorizeManage(actor: Actor, classId: string): string | null {
  if (!canManageEvaluations(actor, classId)) {
    return "Vous n'êtes pas autorisé à gérer les évaluations de cette classe.";
  }
  return null;
}

/** Vérifie que la matière appartient bien à la classe ciblée. */
async function assertSubjectInClass(
  classId: string,
  subjectId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createClient();
  const { data } = await supabase
    .from("subjects")
    .select("id")
    .eq("id", subjectId)
    .eq("class_id", classId)
    .maybeSingle();
  if (!data) return { ok: false, error: "Cette matière n'appartient pas à la classe sélectionnée." };
  return { ok: true };
}

/** Ligne « quand » pour les messages : date, heures et salle si connues. */
function evaluationWhenLine(e: {
  date: string;
  startTime: string | null;
  endTime: string | null;
  room?: string | null;
}): string {
  const parts = [`le ${formatYmdLong(e.date)}`];
  if (e.startTime && e.endTime) parts.push(`de ${e.startTime} à ${e.endTime}`);
  else if (e.startTime) parts.push(`à partir de ${e.startTime}`);
  if (e.room) parts.push(`salle ${e.room}`);
  return parts.join(" · ");
}

/** Variantes sûres pour composer les messages (Zod : champs optionnels). */
function whenLineFrom(data: {
  date: string;
  startTime?: string;
  endTime?: string;
  room?: string;
}): string {
  return evaluationWhenLine({
    date: data.date,
    startTime: data.startTime || null,
    endTime: data.endTime || null,
    room: data.room || null,
  });
}

/**
 * Avertissements de conflit (non bloquants) : évaluation/évaluation et
 * évaluation/cours, calculés avec les données réelles de la classe.
 */
async function computeWarnings(data: {
  classId: string;
  id?: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
}): Promise<{ warnings: string[]; subjectNames: Record<string, string> }> {
  const supabase = createClient();
  const [evaluationsRes, subjectsRes, scheduleRes] = await Promise.all([
    supabase
      .from("evaluations")
      .select("id, date, start_time, end_time, title, status")
      .eq("class_id", data.classId)
      .eq("date", data.date),
    supabase.from("subjects").select("id, name").eq("class_id", data.classId),
    getScheduleSnapshot(data.classId),
  ]);

  const existing: EvaluationTiming[] = (evaluationsRes.data ?? []).map((e) => ({
    id: e.id,
    date: e.date,
    startTime: normalizeTime(e.start_time),
    endTime: normalizeTime(e.end_time),
    title: e.title,
    status: e.status,
  }));

  const subjectNames: Record<string, string> = {};
  for (const s of subjectsRes.data ?? []) subjectNames[s.id] = s.name;

  const candidate: EvaluationTiming = {
    id: data.id ?? null,
    date: data.date,
    startTime: data.startTime || null,
    endTime: data.endTime || null,
  };

  return {
    warnings: evaluationConflictWarnings(
      candidate,
      existing,
      scheduleRes.snapshot.sessions,
      scheduleRes.snapshot.exceptions,
      subjectNames
    ),
    subjectNames,
  };
}

function revalidateEvaluations(classId: string, evaluationId?: string) {
  revalidatePath("/dashboard/evaluations");
  if (evaluationId) revalidatePath(`/dashboard/evaluations/${evaluationId}`);
  revalidatePath("/dashboard/schedule");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/student");
  revalidatePath(`/dashboard/evaluations?class=${classId}`);
}

/** Nom de la matière (messages de notification). */
async function subjectNameOf(subjectId: string): Promise<string> {
  const supabase = createClient();
  const { data } = await supabase
    .from("subjects")
    .select("name")
    .eq("id", subjectId)
    .maybeSingle();
  return data?.name ?? "Une évaluation";
}

/* ──────────────────────────────────────────────────────────────────
   Création
   ────────────────────────────────────────────────────────────────── */

export async function createEvaluationAction(input: unknown): Promise<EvaluationActionResult> {
  const parsed = evaluationSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide" };
  }
  const data = parsed.data;

  const auth = await requireActor();
  if ("error" in auth) return { error: auth.error };
  const { actor } = auth;

  const denied = authorizeManage(actor, data.classId);
  if (denied) return { error: denied };

  const subjectCheck = await assertSubjectInClass(data.classId, data.subjectId);
  if (!subjectCheck.ok) return { error: subjectCheck.error };

  const { warnings } = await computeWarnings({
    classId: data.classId,
    date: data.date,
    startTime: data.startTime || null,
    endTime: data.endTime || null,
  });

  const supabase = createClient();
  const { data: created, error } = await supabase
    .from("evaluations")
    .insert({
      class_id: data.classId,
      subject_id: data.subjectId,
      title: data.title,
      type: data.type,
      description: data.description || null,
      date: data.date,
      start_time: data.startTime || null,
      end_time: data.endTime || null,
      room: data.room || null,
      chapters: data.chapters,
      status: data.publish ? "PUBLISHED" : "DRAFT",
      created_by: actor.id,
    })
    .select("id")
    .single();

  if (error) {
    return { error: "Enregistrement impossible. Vérifiez les informations saisies." };
  }

  // Notification uniquement si visible des étudiants (publication immédiate).
  let notified = 0;
  if (data.publish) {
    const subjectName = await subjectNameOf(data.subjectId);
    notified = await notifyClassMembers({
      classId: data.classId,
      excludeUserId: actor.id,
      type: "EVALUATION_PUBLISHED",
      title: "📝 Nouvelle évaluation",
      message: `${subjectName} — ${EVALUATION_TYPE_LABELS[data.type]} « ${data.title} » ${whenLineFrom(data)}`,
      entityType: "evaluation",
      entityId: created?.id ?? null,
      link: `/dashboard/evaluations/${created?.id ?? ""}`,
    });
  }

  revalidateEvaluations(data.classId, created?.id);
  return { success: true, id: created?.id, notified, warnings };
}

/* ──────────────────────────────────────────────────────────────────
   Édition
   ────────────────────────────────────────────────────────────────── */

interface ExistingEvaluation {
  id: string;
  class_id: string;
  subject_id: string;
  title: string;
  type: EvaluationType;
  date: string;
  start_time: string | null;
  end_time: string | null;
  room: string | null;
  status: EvaluationStatus;
}

async function loadEvaluation(
  evaluationId: string
): Promise<{ existing: ExistingEvaluation } | { error: string }> {
  const supabase = createClient();
  const { data } = await supabase
    .from("evaluations")
    .select("id, class_id, subject_id, title, type, date, start_time, end_time, room, status")
    .eq("id", evaluationId)
    .maybeSingle();
  if (!data) return { error: "Évaluation introuvable ou accès refusé." };
  return { existing: data as ExistingEvaluation };
}

export async function updateEvaluationAction(
  evaluationId: string,
  input: unknown
): Promise<EvaluationActionResult> {
  if (typeof evaluationId !== "string" || !evaluationId) return { error: "Évaluation invalide" };

  const parsed = evaluationSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide" };
  }
  const data = parsed.data;

  const auth = await requireActor();
  if ("error" in auth) return { error: auth.error };
  const { actor } = auth;

  const loaded = await loadEvaluation(evaluationId);
  if ("error" in loaded) return { error: loaded.error };
  const { existing } = loaded;

  const denied = authorizeManage(actor, existing.class_id);
  if (denied) return { error: denied };
  if (existing.class_id !== data.classId) {
    return { error: "L'évaluation n'appartient pas à la classe sélectionnée." };
  }

  const subjectCheck = await assertSubjectInClass(data.classId, data.subjectId);
  if (!subjectCheck.ok) return { error: subjectCheck.error };

  const { warnings } = await computeWarnings({
    classId: data.classId,
    id: evaluationId,
    date: data.date,
    startTime: data.startTime || null,
    endTime: data.endTime || null,
  });

  // Impact réel pour les étudiants : les chapitres et la description ne
  // déclenchent JAMAIS de notification seuls (éditions de détail).
  const existingStart = normalizeTime(existing.start_time);
  const existingEnd = normalizeTime(existing.end_time);
  const dateChanged = existing.date !== data.date;
  const materialChange =
    existing.title !== data.title ||
    existing.subject_id !== data.subjectId ||
    existing.type !== data.type ||
    dateChanged ||
    existingStart !== (data.startTime || null) ||
    existingEnd !== (data.endTime || null) ||
    (existing.room ?? "") !== (data.room || "");

  const supabase = createClient();
  const { error } = await supabase
    .from("evaluations")
    .update({
      subject_id: data.subjectId,
      title: data.title,
      type: data.type,
      description: data.description || null,
      date: data.date,
      start_time: data.startTime || null,
      end_time: data.endTime || null,
      room: data.room || null,
      chapters: data.chapters,
      // Report tracé : l'ancienne date reste visible pour les étudiants.
      rescheduled_from: dateChanged ? existing.date : undefined,
      // Le statut ne change pas ici : publication et annulation ont leurs
      // propres actions (jamais d'effet de bord silencieux).
    })
    .eq("id", evaluationId);

  if (error) {
    return { error: "Mise à jour impossible. Vérifiez les informations saisies." };
  }

  let notified = 0;
  if (existing.status === "PUBLISHED" && materialChange) {
    const subjectName = await subjectNameOf(data.subjectId);
    notified = await notifyClassMembers({
      classId: data.classId,
      excludeUserId: actor.id,
      type: "EVALUATION_UPDATED",
      title: dateChanged ? "🔄 Évaluation reportée" : "🔄 Évaluation modifiée",
      message: dateChanged
        ? `${subjectName} — « ${data.title} » : nouvelle date ${whenLineFrom(data)} (ancienne date : ${formatYmdLong(existing.date)}).`
        : `${subjectName} — « ${data.title} » : ${whenLineFrom(data)}.`,
      entityType: "evaluation",
      entityId: evaluationId,
      link: `/dashboard/evaluations/${evaluationId}`,
    });
  }

  revalidateEvaluations(data.classId, evaluationId);
  return { success: true, notified, warnings };
}

/* ──────────────────────────────────────────────────────────────────
   Publication (brouillon → visible des étudiants)
   ────────────────────────────────────────────────────────────────── */

export async function publishEvaluationAction(evaluationId: string): Promise<EvaluationActionResult> {
  if (typeof evaluationId !== "string" || !evaluationId) return { error: "Évaluation invalide" };

  const auth = await requireActor();
  if ("error" in auth) return { error: auth.error };
  const { actor } = auth;

  const loaded = await loadEvaluation(evaluationId);
  if ("error" in loaded) return { error: loaded.error };
  const { existing } = loaded;

  const denied = authorizeManage(actor, existing.class_id);
  if (denied) return { error: denied };
  if (existing.status === "PUBLISHED") return { success: true, notified: 0 };
  if (existing.status === "CANCELLED") {
    return { error: "Une évaluation annulée ne peut pas être republiée. Créez-en une nouvelle." };
  }

  const supabase = createClient();
  const { data: full } = await supabase
    .from("evaluations")
    .select("start_time, end_time, room")
    .eq("id", evaluationId)
    .maybeSingle();

  const { error } = await supabase
    .from("evaluations")
    .update({ status: "PUBLISHED" })
    .eq("id", evaluationId);
  if (error) return { error: "Publication impossible." };

  const subjectName = await subjectNameOf(existing.subject_id);
  const notified = await notifyClassMembers({
    classId: existing.class_id,
    excludeUserId: actor.id,
    type: "EVALUATION_PUBLISHED",
    title: "📝 Nouvelle évaluation",
    message: `${subjectName} — ${EVALUATION_TYPE_LABELS[existing.type]} « ${existing.title} » ${evaluationWhenLine({
      date: existing.date,
      startTime: normalizeTime(full?.start_time),
      endTime: normalizeTime(full?.end_time),
      room: full?.room ?? null,
    })}`,
    entityType: "evaluation",
    entityId: evaluationId,
    link: `/dashboard/evaluations/${evaluationId}`,
  });

  revalidateEvaluations(existing.class_id, evaluationId);
  return { success: true, notified };
}

/* ──────────────────────────────────────────────────────────────────
   Annulation (tracée, avec motif facultatif)
   ────────────────────────────────────────────────────────────────── */

export async function cancelEvaluationAction(
  evaluationId: string,
  reason?: string
): Promise<EvaluationActionResult> {
  if (typeof evaluationId !== "string" || !evaluationId) return { error: "Évaluation invalide" };
  const note = typeof reason === "string" ? reason.trim().slice(0, 300) : "";

  const auth = await requireActor();
  if ("error" in auth) return { error: auth.error };
  const { actor } = auth;

  const loaded = await loadEvaluation(evaluationId);
  if ("error" in loaded) return { error: loaded.error };
  const { existing } = loaded;

  const denied = authorizeManage(actor, existing.class_id);
  if (denied) return { error: denied };
  if (existing.status !== "PUBLISHED") {
    return { error: "Seule une évaluation publiée peut être annulée." };
  }

  const supabase = createClient();
  const { data: full } = await supabase
    .from("evaluations")
    .select("start_time, end_time, room")
    .eq("id", evaluationId)
    .maybeSingle();

  const { error } = await supabase
    .from("evaluations")
    .update({ status: "CANCELLED", cancellation_note: note || null })
    .eq("id", evaluationId);
  if (error) return { error: "Annulation impossible." };

  const subjectName = await subjectNameOf(existing.subject_id);
  const when = evaluationWhenLine({
    date: existing.date,
    startTime: normalizeTime(full?.start_time),
    endTime: normalizeTime(full?.end_time),
    room: full?.room ?? null,
  });
  const notified = await notifyClassMembers({
    classId: existing.class_id,
    excludeUserId: actor.id,
    type: "EVALUATION_CANCELLED",
    title: "❌ Évaluation annulée",
    message: `${subjectName} — « ${existing.title} » (${when}) est annulée.${note ? ` Motif : ${note}` : ""}`,
    entityType: "evaluation",
    entityId: evaluationId,
    link: `/dashboard/evaluations/${evaluationId}`,
  });

  revalidateEvaluations(existing.class_id, evaluationId);
  return { success: true, notified };
}

/* ──────────────────────────────────────────────────────────────────
   Suppression
   ────────────────────────────────────────────────────────────────── */

export async function deleteEvaluationAction(evaluationId: string): Promise<EvaluationActionResult> {
  if (typeof evaluationId !== "string" || !evaluationId) return { error: "Évaluation invalide" };

  const auth = await requireActor();
  if ("error" in auth) return { error: auth.error };
  const { actor } = auth;

  const loaded = await loadEvaluation(evaluationId);
  if ("error" in loaded) return { error: loaded.error };
  const { existing } = loaded;

  const denied = authorizeManage(actor, existing.class_id);
  if (denied) return { error: denied };

  const supabase = createClient();
  const { error } = await supabase.from("evaluations").delete().eq("id", evaluationId);
  if (error) return { error: "Suppression impossible." };

  // Une évaluation déjà publiée disparaît de l'information des étudiants :
  // on les en informe explicitement plutôt qu'en silence (les annulées ont
  // déjà été notifiées lors de leur annulation).
  let notified = 0;
  if (existing.status === "PUBLISHED") {
    notified = await notifyClassMembers({
      classId: existing.class_id,
      excludeUserId: actor.id,
      type: "EVALUATION_CANCELLED",
      title: "🗑️ Évaluation retirée",
      message: `L'évaluation « ${existing.title} » a été retirée du planning par un délégué.`,
      entityType: "evaluation",
      entityId: evaluationId,
      link: "/dashboard/evaluations",
    });
  }

  revalidateEvaluations(existing.class_id, evaluationId);
  return { success: true, notified };
}

/* ──────────────────────────────────────────────────────────────────
   Données d'édition complètes (description + chapitres) pour le
   formulaire ouvert depuis la liste — RLS + rôle recontrôlés.
   ────────────────────────────────────────────────────────────────── */

export async function getEvaluationEditDataAction(evaluationId: string): Promise<
  { success: true; description: string; chapters: string[] } | { error: string }
> {
  if (typeof evaluationId !== "string" || !evaluationId) return { error: "Évaluation invalide" };

  const auth = await requireActor();
  if ("error" in auth) return { error: auth.error };

  const supabase = createClient();
  const { data } = await supabase
    .from("evaluations")
    .select("class_id, description, chapters")
    .eq("id", evaluationId)
    .maybeSingle();
  if (!data) return { error: "Évaluation introuvable ou accès refusé." };

  const denied = authorizeManage(auth.actor, data.class_id);
  if (denied) return { error: denied };

  return { success: true, description: data.description ?? "", chapters: data.chapters ?? [] };
}

/* ──────────────────────────────────────────────────────────────────
   Ressources de révision (facultatives) — remplacement de l'ensemble
   ────────────────────────────────────────────────────────────────── */

export async function setEvaluationResourcesAction(
  input: unknown
): Promise<EvaluationActionResult> {
  const parsed = evaluationResourcesSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide" };
  }
  const data = parsed.data;

  const auth = await requireActor();
  if ("error" in auth) return { error: auth.error };
  const { actor } = auth;

  const loaded = await loadEvaluation(data.evaluationId);
  if ("error" in loaded) return { error: loaded.error };
  const { existing } = loaded;

  if (!canManageEvaluationResources(actor, existing.class_id)) {
    return { error: "Vous n'êtes pas autorisé à gérer les ressources de cette évaluation." };
  }

  const supabase = createClient();

  // Chaque ressource doit appartenir à la classe de l'évaluation (le serveur
  // ne fait pas confiance aux identifiants envoyés ; les FK composite
  // confirment en base).
  if (data.documentIds.length > 0) {
    const { data: docs } = await supabase
      .from("documents")
      .select("id")
      .eq("class_id", existing.class_id)
      .in("id", data.documentIds);
    if ((docs ?? []).length !== new Set(data.documentIds).size) {
      return { error: "Un document sélectionné n'appartient pas à cette classe." };
    }
  }
  if (data.hintIds.length > 0) {
    const { data: hints } = await supabase
      .from("hints")
      .select("id")
      .eq("class_id", existing.class_id)
      .in("id", data.hintIds);
    if ((hints ?? []).length !== new Set(data.hintIds).size) {
      return { error: "Un hint sélectionné n'appartient pas à cette classe." };
    }
  }

  const uniqueDocs = Array.from(new Set(data.documentIds));
  const uniqueHints = Array.from(new Set(data.hintIds));

  const [delDocs, delHints] = await Promise.all([
    supabase.from("evaluation_documents").delete().eq("evaluation_id", data.evaluationId),
    supabase.from("evaluation_hints").delete().eq("evaluation_id", data.evaluationId),
  ]);
  if (delDocs.error || delHints.error) {
    return { error: "Mise à jour des ressources impossible." };
  }

  if (uniqueDocs.length > 0) {
    const { error } = await supabase.from("evaluation_documents").insert(
      uniqueDocs.map((documentId) => ({
        evaluation_id: data.evaluationId,
        class_id: existing.class_id,
        document_id: documentId,
      }))
    );
    if (error) return { error: "Association des documents impossible." };
  }
  if (uniqueHints.length > 0) {
    const { error } = await supabase.from("evaluation_hints").insert(
      uniqueHints.map((hintId) => ({
        evaluation_id: data.evaluationId,
        class_id: existing.class_id,
        hint_id: hintId,
      }))
    );
    if (error) return { error: "Association des hints impossible." };
  }

  revalidateEvaluations(existing.class_id, data.evaluationId);
  return { success: true };
}
