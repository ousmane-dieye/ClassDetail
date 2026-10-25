"use server";

/**
 * Server Actions du module Emploi du temps.
 *
 * Sécurité (chaque mutation) :
 *   1. Session vérifiée côté serveur (supabase.auth.getUser()).
 *   2. Validation Zod de TOUTES les entrées.
 *   3. Rôle vérifié (DELEGATE de la classe ciblée ou ADMIN) — jamais depuis
 *      une valeur envoyée par le client : relu dans `profiles`.
 *   4. Appartenance de la séance à la classe vérifiée avant mutation.
 *   5. La matière (et la matière de remplacement) doivent appartenir à la
 *      classe (vérification serveur + FK composite en base).
 *   6. Cohérence temporelle + pré-détection de conflit serveur ; la
 *      contrainte d'exclusion GiST garantit en base contre les courses.
 *   7. RLS PostgreSQL en dernière ligne (défense en profondeur).
 *
 * Notifications : jamais pour un brouillon ; une seule notification
 * regroupée par opération de publication ; modifications sans impact
 * réel (note, salle identique…) n'en déclenchent aucune.
 */

import { createClient } from "@/lib/supabase/server";
import {
  scheduleExceptionSchema,
  scheduleSessionSchema,
  subjectColorSchema,
} from "@/lib/validation/schemas";
import { canManageSchedule, canPublishSchedule } from "@/lib/business/permissions";
import {
  conflictMessage,
  findConflict,
  type ConflictCandidate,
  type ExistingSession,
} from "@/lib/schedule/conflicts";
import { notifyClassMembers } from "@/lib/notifications/service";
import { revalidatePath } from "next/cache";
import type { UserRole } from "@/types/database.types";

type ActionResult = { success: true; id?: string; notified?: number } | { error: string };

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
  if (!canManageSchedule(actor, classId)) {
    return "Vous n'êtes pas autorisé à gérer l'emploi du temps de cette classe.";
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

/** Charge les séances existantes de la classe pour la pré-détection de conflit. */
async function loadExistingSessions(classId: string): Promise<ExistingSession[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("schedule_sessions")
    .select("id, day_of_week, start_time, end_time, valid_from, valid_until")
    .eq("class_id", classId);
  return (data ?? []).map((s) => ({
    id: s.id,
    dayOfWeek: s.day_of_week,
    startTime: s.start_time,
    endTime: s.end_time,
    validFrom: s.valid_from,
    validUntil: s.valid_until,
  }));
}

function revalidateSchedule(classId?: string) {
  revalidatePath("/dashboard/schedule");
  revalidatePath("/dashboard/student");
  if (classId) revalidatePath(`/dashboard/schedule?class=${classId}`);
}

/* ──────────────────────────────────────────────────────────────────
   Création d'une séance récurrente
   ────────────────────────────────────────────────────────────────── */

export async function createScheduleSessionAction(input: unknown): Promise<ActionResult> {
  const parsed = scheduleSessionSchema.safeParse(input);
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

  const candidate: ConflictCandidate = {
    dayOfWeek: data.dayOfWeek,
    startTime: data.startTime,
    endTime: data.endTime,
    validFrom: data.validFrom,
    validUntil: data.validUntil || null,
  };
  const clash = findConflict(candidate, await loadExistingSessions(data.classId));
  if (clash) return { error: conflictMessage() };

  const supabase = createClient();
  const { data: created, error } = await supabase
    .from("schedule_sessions")
    .insert({
      class_id: data.classId,
      subject_id: data.subjectId,
      day_of_week: data.dayOfWeek,
      start_time: data.startTime,
      end_time: data.endTime,
      room: data.room || null,
      teacher: data.teacher || null,
      valid_from: data.validFrom,
      valid_until: data.validUntil || null,
      status: data.publish ? "PUBLISHED" : "DRAFT",
      created_by: actor.id,
    })
    .select("id")
    .single();

  if (error) {
    // 23P01 = exclusion violation (course concurrente détectée par la base).
    if (error.code === "23P01") return { error: conflictMessage() };
    return { error: "Enregistrement impossible. Vérifiez les informations saisies." };
  }

  let notified = 0;
  if (data.publish) {
    const { data: subject } = await supabase
      .from("subjects")
      .select("name")
      .eq("id", data.subjectId)
      .maybeSingle();
    notified = await notifyClassMembers({
      classId: data.classId,
      excludeUserId: actor.id,
      type: "SCHEDULE_PUBLISHED",
      title: "📅 Nouvelle séance à l'emploi du temps",
      message: `${subject?.name ?? "Un cours"} — jour ${data.dayOfWeek}, ${data.startTime}–${data.endTime}${data.room ? `, salle ${data.room}` : ""}`,
      entityType: "schedule_session",
      entityId: created?.id ?? null,
      link: "/dashboard/schedule",
    });
  }

  revalidateSchedule(data.classId);
  return { success: true, id: created?.id, notified };
}

/* ──────────────────────────────────────────────────────────────────
   Édition d'une séance récurrente
   ────────────────────────────────────────────────────────────────── */

export async function updateScheduleSessionAction(
  sessionId: string,
  input: unknown
): Promise<ActionResult> {
  if (typeof sessionId !== "string" || !sessionId) return { error: "Séance invalide" };

  const parsed = scheduleSessionSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide" };
  }
  const data = parsed.data;

  const auth = await requireActor();
  if ("error" in auth) return { error: auth.error };
  const { actor } = auth;

  const supabase = createClient();

  // La séance existante est lue AVANT mutation : appartenance à la classe +
  // statut courant (RLS restreint déjà la lecture à la classe du délégué).
  const { data: existing } = await supabase
    .from("schedule_sessions")
    .select("id, class_id, status")
    .eq("id", sessionId)
    .maybeSingle();
  if (!existing) return { error: "Séance introuvable ou accès refusé." };

  const denied = authorizeManage(actor, existing.class_id);
  if (denied) return { error: denied };
  if (existing.class_id !== data.classId) {
    return { error: "La séance n'appartient pas à la classe sélectionnée." };
  }

  const subjectCheck = await assertSubjectInClass(data.classId, data.subjectId);
  if (!subjectCheck.ok) return { error: subjectCheck.error };

  const candidate: ConflictCandidate = {
    excludeSessionId: sessionId,
    dayOfWeek: data.dayOfWeek,
    startTime: data.startTime,
    endTime: data.endTime,
    validFrom: data.validFrom,
    validUntil: data.validUntil || null,
  };
  const clash = findConflict(candidate, await loadExistingSessions(data.classId));
  if (clash) return { error: conflictMessage() };

  const { error } = await supabase
    .from("schedule_sessions")
    .update({
      subject_id: data.subjectId,
      day_of_week: data.dayOfWeek,
      start_time: data.startTime,
      end_time: data.endTime,
      room: data.room || null,
      teacher: data.teacher || null,
      valid_from: data.validFrom,
      valid_until: data.validUntil || null,
      // Un brouillon édité reste brouillon ; une séance publiée le reste.
      // Le passage brouillon → publié passe par publishScheduleSessionAction.
      status: existing.status === "PUBLISHED" && data.publish ? "PUBLISHED" : existing.status,
    })
    .eq("id", sessionId);

  if (error) {
    if (error.code === "23P01") return { error: conflictMessage() };
    return { error: "Mise à jour impossible. Vérifiez les informations saisies." };
  }

  // Notification uniquement si la séance est déjà officielle (impact réel).
  let notified = 0;
  if (existing.status === "PUBLISHED") {
    const { data: subject } = await supabase
      .from("subjects")
      .select("name")
      .eq("id", data.subjectId)
      .maybeSingle();
    notified = await notifyClassMembers({
      classId: data.classId,
      excludeUserId: actor.id,
      type: "SCHEDULE_UPDATED",
      title: "🔄 Séance modifiée",
      message: `${subject?.name ?? "Un cours"} — nouveau créneau : jour ${data.dayOfWeek}, ${data.startTime}–${data.endTime}${data.room ? `, salle ${data.room}` : ""}`,
      entityType: "schedule_session",
      entityId: sessionId,
      link: "/dashboard/schedule",
    });
  }

  revalidateSchedule(data.classId);
  return { success: true, notified };
}

/* ──────────────────────────────────────────────────────────────────
   Publication (brouillon → officiel)
   ────────────────────────────────────────────────────────────────── */

export async function publishScheduleSessionAction(sessionId: string): Promise<ActionResult> {
  if (typeof sessionId !== "string" || !sessionId) return { error: "Séance invalide" };

  const auth = await requireActor();
  if ("error" in auth) return { error: auth.error };
  const { actor } = auth;

  const supabase = createClient();
  const { data: existing } = await supabase
    .from("schedule_sessions")
    .select("id, class_id, status, day_of_week, start_time, end_time, room, subject_id")
    .eq("id", sessionId)
    .maybeSingle();
  if (!existing) return { error: "Séance introuvable ou accès refusé." };

  const denied = authorizeManage(actor, existing.class_id);
  if (denied) return { error: denied };
  if (!canPublishSchedule(actor, existing.class_id)) {
    return { error: "Publication non autorisée." };
  }
  if (existing.status === "PUBLISHED") return { success: true, notified: 0 };

  const { error } = await supabase
    .from("schedule_sessions")
    .update({ status: "PUBLISHED" })
    .eq("id", sessionId);
  if (error) return { error: "Publication impossible." };

  const { data: subject } = await supabase
    .from("subjects")
    .select("name")
    .eq("id", existing.subject_id)
    .maybeSingle();
  const notified = await notifyClassMembers({
    classId: existing.class_id,
    excludeUserId: actor.id,
    type: "SCHEDULE_PUBLISHED",
    title: "📅 Nouvelle séance à l'emploi du temps",
    message: `${subject?.name ?? "Un cours"} — jour ${existing.day_of_week}, ${existing.start_time.slice(0, 5)}–${existing.end_time.slice(0, 5)}${existing.room ? `, salle ${existing.room}` : ""}`,
    entityType: "schedule_session",
    entityId: sessionId,
    link: "/dashboard/schedule",
  });

  revalidateSchedule(existing.class_id);
  return { success: true, notified };
}

/* ──────────────────────────────────────────────────────────────────
   Suppression d'une séance (et de ses exceptions, en cascade SQL)
   ────────────────────────────────────────────────────────────────── */

export async function deleteScheduleSessionAction(sessionId: string): Promise<ActionResult> {
  if (typeof sessionId !== "string" || !sessionId) return { error: "Séance invalide" };

  const auth = await requireActor();
  if ("error" in auth) return { error: auth.error };
  const { actor } = auth;

  const supabase = createClient();
  const { data: existing } = await supabase
    .from("schedule_sessions")
    .select("id, class_id, status")
    .eq("id", sessionId)
    .maybeSingle();
  if (!existing) return { error: "Séance introuvable ou accès refusé." };

  const denied = authorizeManage(actor, existing.class_id);
  if (denied) return { error: denied };

  const { error } = await supabase.from("schedule_sessions").delete().eq("id", sessionId);
  if (error) return { error: "Suppression impossible." };

  // Une séance déjà publiée disparaît de l'information des étudiants :
  // on les en informe explicitement plutôt que de la faire disparaître en silence.
  let notified = 0;
  if (existing.status === "PUBLISHED") {
    notified = await notifyClassMembers({
      classId: existing.class_id,
      excludeUserId: actor.id,
      type: "SCHEDULE_UPDATED",
      title: "🗑️ Séance retirée de l'emploi du temps",
      message: "Une séance de votre emploi du temps a été supprimée par un délégué.",
      entityType: "schedule_session",
      entityId: sessionId,
      link: "/dashboard/schedule",
    });
  }

  revalidateSchedule(existing.class_id);
  return { success: true, notified };
}

/* ──────────────────────────────────────────────────────────────────
   Exceptions datées (annuler / déplacer / changer de salle)
   ────────────────────────────────────────────────────────────────── */

export async function upsertScheduleExceptionAction(input: unknown): Promise<ActionResult> {
  const parsed = scheduleExceptionSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide" };
  }
  const data = parsed.data;

  const auth = await requireActor();
  if ("error" in auth) return { error: auth.error };
  const { actor } = auth;

  const supabase = createClient();
  const { data: session } = await supabase
    .from("schedule_sessions")
    .select("id, class_id, status, subject_id, day_of_week, start_time, end_time")
    .eq("id", data.sessionId)
    .maybeSingle();
  if (!session) return { error: "Séance introuvable ou accès refusé." };

  const denied = authorizeManage(actor, session.class_id);
  if (denied) return { error: denied };

  const row: Record<string, unknown> = {
    session_id: data.sessionId,
    class_id: session.class_id,
    date: data.date,
    is_cancelled: data.mode === "cancel",
    new_start_time: data.mode === "move" ? data.startTime : null,
    new_end_time: data.mode === "move" ? data.endTime : null,
    new_room: data.mode === "room" ? data.room || null : null,
    new_subject_id: null,
    note: data.note || null,
    created_by: actor.id,
  };

  const { data: saved, error } = await supabase
    .from("schedule_session_exceptions")
    .upsert(row, { onConflict: "session_id,date" })
    .select("id")
    .single();
  if (error) return { error: "Enregistrement de l'impossibilité impossible." };

  // Notification uniquement si la séance est officielle ET la date à venir
  // (sinon : aucun impact pour les étudiants).
  let notified = 0;
  const todayYmd = new Intl.DateTimeFormat("en-CA", {
    timeZone: process.env.NEXT_PUBLIC_APP_TIMEZONE || "Africa/Dakar",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  if (session.status === "PUBLISHED" && data.date >= todayYmd) {
    const { data: subject } = await supabase
      .from("subjects")
      .select("name")
      .eq("id", session.subject_id)
      .maybeSingle();
    const name = subject?.name ?? "Un cours";
    const type = data.mode === "cancel" ? "SESSION_CANCELLED" : "SCHEDULE_UPDATED";
    const title = data.mode === "cancel" ? "❌ Séance annulée" : "🔄 Séance modifiée";
    const message =
      data.mode === "cancel"
        ? `${name} du ${data.date} est annulée.`
        : data.mode === "move"
        ? `${name} du ${data.date} est déplacée : ${data.startTime}–${data.endTime}.`
        : `${name} du ${data.date} aura lieu en salle ${data.room}.`;
    notified = await notifyClassMembers({
      classId: session.class_id,
      excludeUserId: actor.id,
      type,
      title,
      message,
      entityType: "schedule_exception",
      entityId: saved?.id ?? null,
      link: "/dashboard/schedule",
    });
  }

  revalidateSchedule(session.class_id);
  return { success: true, id: saved?.id, notified };
}

/** Supprime une exception (la séance reprend son créneau récurrent). */
export async function deleteScheduleExceptionAction(
  exceptionId: string,
  sessionId: string
): Promise<ActionResult> {
  if (typeof exceptionId !== "string" || !exceptionId) return { error: "Exception invalide" };

  const auth = await requireActor();
  if ("error" in auth) return { error: auth.error };
  const { actor } = auth;

  const supabase = createClient();
  const { data: session } = await supabase
    .from("schedule_sessions")
    .select("id, class_id, status")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session) return { error: "Séance introuvable ou accès refusé." };

  const denied = authorizeManage(actor, session.class_id);
  if (denied) return { error: denied };

  const { error } = await supabase
    .from("schedule_session_exceptions")
    .delete()
    .eq("id", exceptionId)
    .eq("session_id", sessionId);
  if (error) return { error: "Suppression impossible." };

  revalidateSchedule(session.class_id);
  return { success: true };
}

/* ──────────────────────────────────────────────────────────────────
   Couleur d'une matière (palette contrôlée)
   ────────────────────────────────────────────────────────────────── */

export async function updateSubjectColorAction(input: unknown): Promise<ActionResult> {
  const parsed = subjectColorSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Formule invalide" };
  }
  const data = parsed.data;

  const auth = await requireActor();
  if ("error" in auth) return { error: auth.error };
  const { actor } = auth;

  const supabase = createClient();
  const { data: subject } = await supabase
    .from("subjects")
    .select("id, class_id, name")
    .eq("id", data.subjectId)
    .maybeSingle();
  if (!subject) return { error: "Matière introuvable ou accès refusé." };

  const denied = authorizeManage(actor, subject.class_id);
  if (denied) return { error: denied };

  // Le trigger PostgreSQL subjects_guard_update limite un délégué à la seule
  // colonne color_key ; la policy RLS limite à sa classe.
  const { error } = await supabase
    .from("subjects")
    .update({ color_key: data.colorKey })
    .eq("id", data.subjectId);
  if (error) return { error: "Modification de la couleur impossible." };

  revalidateSchedule(subject.class_id);
  return { success: true };
}
