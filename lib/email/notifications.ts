/**
 * Orchestration des emails + système ANTI-DOUBLON.
 *
 * Table `assignment_email_notifications` (voir supabase/migrations) :
 * Avant chaque envoi :
 *   1. on vérifie si une notification de même type existe déjà pour
 *      (assignment, user) avec le statut SENT ;
 *   2. SENT existe → on n'envoie rien (skipped) ;
 *   3. sinon on envoie ;
 *   4. succès → enregistrement SENT ;
 *   5. échec → enregistrement FAILED + message d'erreur (sans secret).
 *
 * La table porte aussi un index UNIQUE partiel (status='SENT') qui rend le
 * système anti-doublon robuste même en cas de course (double envoi simultané).
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { isValidEmail, sanitizeError, sendAssignmentReminderEmail, sendAuthenticationApprovedEmail, type EmailProvider } from "@/lib/email/emailService";
import { formatDueDate, formatDueTime } from "@/lib/email/reminders";
import type { EmailNotificationType } from "@/types/database.types";

/**
 * Types d'email « historiques » (authentification + rappels J-3/J-1).
 * Les emails pédagogiques utilisent directement leur `NotificationType`
 * (le type de l'événement) — voir `EmailNotificationType`.
 */
export const EMAIL_NOTIFICATION_TYPE = {
  AUTHENTICATION_APPROVED: "AUTHENTICATION_APPROVED",
  ASSIGNMENT_3_DAYS: "ASSIGNMENT_3_DAYS",
  ASSIGNMENT_1_DAY: "ASSIGNMENT_1_DAY",
} as const;

export type { EmailNotificationType };

export type EmailNotificationStatus = "PENDING" | "SENT" | "FAILED";

export interface EmailNotificationRecord {
  id: string;
  assignment_id: string | null;
  user_id: string;
  email: string;
  notification_type: EmailNotificationType;
  status: EmailNotificationStatus;
  sent_at: string | null;
  error_message: string | null;
  created_at: string;
}

export interface SendResult {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  error?: string;
}

function admin() {
  return createAdminClient();
}

/** Vérifie si un email SENT existe déjà pour ce (assignment, user, type). */
export async function hasEmailBeenSent(
  assignmentId: string | null,
  userId: string,
  type: EmailNotificationType
): Promise<boolean> {
  let query = admin()
    .from("assignment_email_notifications")
    .select("id")
    .eq("user_id", userId)
    .eq("notification_type", type)
    .eq("status", "SENT");

  if (assignmentId) query = query.eq("assignment_id", assignmentId);
  else query = query.is("assignment_id", null);

  const { data } = await query.maybeSingle();
  return Boolean(data);
}

export interface RecordEmailNotificationInput {
  assignmentId: string | null;
  userId: string;
  email: string;
  type: EmailNotificationType;
  status: EmailNotificationStatus;
  errorMessage?: string | null;
  /** Entité polymorphe (evaluation, schedule_session, chat…) — null pour l'auth. */
  entityType?: string | null;
  entityId?: string | null;
}

/** Enregistre le résultat de l'envoi. */
export async function recordEmailNotification(input: RecordEmailNotificationInput): Promise<void> {
  const now = new Date().toISOString();
  await admin().from("assignment_email_notifications").insert({
    assignment_id: input.assignmentId,
    user_id: input.userId,
    email: input.email,
    notification_type: input.type,
    status: input.status,
    sent_at: input.status === "SENT" ? now : null,
    error_message: input.errorMessage ?? null,
    entity_type: input.entityType ?? null,
    entity_id: input.entityId ?? null,
  });
}

export interface AlreadySentQuery {
  type: EmailNotificationType;
  userIds: string[];
  assignmentId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
}

/**
 * Anti-doublon PAR LOT : retourne les utilisateurs à qui cet email (même
 * type + même clé métier) a déjà été envoyé avec succès (SENT).
 *
 * Une seule requête pour tous les destinataires — jamais N requêtes.
 * Une erreur de lecture est considérée comme « rien d'envoyé » (l'envoi reste
 * protégé par les index uniques partiels en base : un doublon éventuel est
 * rejeté au moment de l'enregistrement, jamais envoyé deux fois).
 */
export async function findAlreadySentUserIds(query: AlreadySentQuery): Promise<Set<string>> {
  const sent = new Set<string>();
  if (query.userIds.length === 0) return sent;

  try {
    let q = admin()
      .from("assignment_email_notifications")
      .select("user_id")
      .eq("notification_type", query.type)
      .eq("status", "SENT")
      .in("user_id", query.userIds);

    if (query.assignmentId) {
      q = q.eq("assignment_id", query.assignmentId);
    } else if (query.entityId && query.entityType) {
      q = q.eq("entity_type", query.entityType).eq("entity_id", query.entityId);
    } else {
      q = q.is("assignment_id", null).is("entity_id", null);
    }

    const { data, error } = await q;
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      if (row.user_id) sent.add(row.user_id);
    }
  } catch (error) {
    console.error(
      "EmailNotifications : anti-doublon illisible (type=%s) : %s",
      query.type,
      error instanceof Error ? error.message : String(error)
    );
  }
  return sent;
}

/** Enregistre plusieurs résultats d'envoi en une seule écriture. */
export async function recordEmailNotifications(inputs: RecordEmailNotificationInput[]): Promise<void> {
  if (inputs.length === 0) return;
  const now = new Date().toISOString();
  await admin().from("assignment_email_notifications").insert(
    inputs.map((input) => ({
      assignment_id: input.assignmentId,
      user_id: input.userId,
      email: input.email,
      notification_type: input.type,
      status: input.status,
      sent_at: input.status === "SENT" ? now : null,
      error_message: input.errorMessage ?? null,
      entity_type: input.entityType ?? null,
      entity_id: input.entityId ?? null,
    }))
  );
}

/**
 * Point d'entrée unique utilisé par la décision d'inscription.
 * - ACCEPTED → envoie l'email "accès accepté" (anti-doublon).
 * - REJECTED → aucun email (retourne null).
 */
export async function handleRegistrationDecisionEmail(input: {
  decision: "ACCEPTED" | "REJECTED";
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
}): Promise<SendResult | null> {
  if (input.decision !== "ACCEPTED") return null;
  return sendAuthenticationApprovedEmailToUser({
    userId: input.userId,
    email: input.email,
    firstName: input.firstName,
    lastName: input.lastName,
  });
}

/**
 * Envoi "accès accepté" avec anti-doublon.
 * Pas de second email si un AUTHENTICATION_APPROVED SENT existe déjà.
 */
export async function sendAuthenticationApprovedEmailToUser(input: {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
}): Promise<SendResult> {
  const already = await hasEmailBeenSent(null, input.userId, EMAIL_NOTIFICATION_TYPE.AUTHENTICATION_APPROVED);
  if (already) return { ok: true, skipped: true, reason: "already_sent" };

  if (!isValidEmail(input.email)) {
    await recordEmailNotification({
      assignmentId: null,
      userId: input.userId,
      email: input.email,
      type: EMAIL_NOTIFICATION_TYPE.AUTHENTICATION_APPROVED,
      status: "FAILED",
      errorMessage: "Adresse email invalide",
    });
    return { ok: false, skipped: true, error: "Adresse email invalide" };
  }

  try {
    const result = await sendAuthenticationApprovedEmail({
      to: input.email,
      firstName: input.firstName,
      lastName: input.lastName,
    });

    if (result.skipped) return { ok: true, skipped: true, reason: "not_configured" };

    try {
      await recordEmailNotification({
        assignmentId: null,
        userId: input.userId,
        email: input.email,
        type: EMAIL_NOTIFICATION_TYPE.AUTHENTICATION_APPROVED,
        status: "SENT",
      });
    } catch {
      // Course possible : un autre envoi a déjà enregistré SENT (unique index).
    }
    return { ok: true };
  } catch (error) {
    const clean = sanitizeError(error);
    try {
      await recordEmailNotification({
        assignmentId: null,
        userId: input.userId,
        email: input.email,
        type: EMAIL_NOTIFICATION_TYPE.AUTHENTICATION_APPROVED,
        status: "FAILED",
        errorMessage: clean,
      });
    } catch {
      // L'échec d'enregistrement ne doit pas faire planter le flux.
    }
    return { ok: false, error: clean };
  }
}

/**
 * Envoi d'un rappel de devoir (J-3 / J-1) avec anti-doublon.
 */
export async function sendAssignmentReminderEmailToUser(input: {
  taskId: string;
  userId: string;
  email: string;
  firstName: string;
  taskTitle: string;
  subjectName: string;
  dueDate: Date;
  daysLeft: "3" | "1";
}): Promise<SendResult> {
  const type = input.daysLeft === "1" ? EMAIL_NOTIFICATION_TYPE.ASSIGNMENT_1_DAY : EMAIL_NOTIFICATION_TYPE.ASSIGNMENT_3_DAYS;

  const already = await hasEmailBeenSent(input.taskId, input.userId, type);
  if (already) return { ok: true, skipped: true, reason: "already_sent" };

  if (!isValidEmail(input.email)) {
    await recordEmailNotification({
      assignmentId: input.taskId,
      userId: input.userId,
      email: input.email,
      type,
      status: "FAILED",
      errorMessage: "Adresse email invalide",
    });
    return { ok: false, skipped: true, error: "Adresse email invalide" };
  }

  try {
    const result = await sendAssignmentReminderEmail({
      to: input.email,
      firstName: input.firstName,
      taskTitle: input.taskTitle,
      subjectName: input.subjectName,
      dueDateLabel: formatDueDate(input.dueDate),
      dueTimeLabel: formatDueTime(input.dueDate),
      daysLeft: input.daysLeft,
    });

    if (result.skipped) return { ok: true, skipped: true, reason: "not_configured" };

    try {
      await recordEmailNotification({
        assignmentId: input.taskId,
        userId: input.userId,
        email: input.email,
        type,
        status: "SENT",
      });
    } catch {
      // Anti-doublon base de données : un SENT a déjà été écrit.
    }
    return { ok: true };
  } catch (error) {
    const clean = sanitizeError(error);
    try {
      await recordEmailNotification({
        assignmentId: input.taskId,
        userId: input.userId,
        email: input.email,
        type,
        status: "FAILED",
        errorMessage: clean,
      });
    } catch {
      // Idem : ne jamais faire planter le flux.
    }
    return { ok: false, error: clean };
  }
}

// ---------------------------------------------------------------
// Données du dashboard admin "Emails & Notifications"
// ---------------------------------------------------------------

export interface EmailDashboardData {
  from: string;
  fromName: string;
  provider: EmailProvider;
  counts: {
    total: number;
    sent: number;
    failed: number;
    pending: number;
  };
  recent: Array<{
    id: string;
    email: string;
    notification_type: EmailNotificationType;
    status: EmailNotificationStatus;
    sent_at: string | null;
    error_message: string | null;
    created_at: string;
    student_name: string;
    assignment_title: string | null;
  }>;
}

export async function getEmailDashboardData(limit = 20): Promise<EmailDashboardData> {
  const client = admin();

  const [{ count: total }, { count: sent }, { count: failed }, { count: pending }] = await Promise.all([
    client.from("assignment_email_notifications").select("id", { count: "exact", head: true }),
    client.from("assignment_email_notifications").select("id", { count: "exact", head: true }).eq("status", "SENT"),
    client.from("assignment_email_notifications").select("id", { count: "exact", head: true }).eq("status", "FAILED"),
    client.from("assignment_email_notifications").select("id", { count: "exact", head: true }).eq("status", "PENDING"),
  ]);

  const { data } = await client
    .from("assignment_email_notifications")
    .select("*, profiles(first_name, last_name), tasks(title)")
    .order("created_at", { ascending: false })
    .limit(limit);

  const rows = (data ?? []) as any[];

  return {
    from: getSenderForDashboard().from,
    fromName: getSenderForDashboard().fromName,
    provider: getSenderForDashboard().provider,
    counts: {
      total: total ?? 0,
      sent: sent ?? 0,
      failed: failed ?? 0,
      pending: pending ?? 0,
    },
    recent: rows.map((row) => ({
      id: row.id,
      email: row.email,
      notification_type: row.notification_type,
      status: row.status,
      sent_at: row.sent_at,
      error_message: row.error_message,
      created_at: row.created_at,
      student_name: row.profiles
        ? `${row.profiles.first_name ?? ""} ${row.profiles.last_name ?? ""}`.trim()
        : "—",
      assignment_title: row.tasks?.title ?? null,
    })),
  };
}

function getSenderForDashboard() {
  return {
    from: process.env.EMAIL_FROM || process.env.RESEND_FROM_EMAIL || "—",
    fromName: process.env.EMAIL_FROM_NAME || "—",
    provider: (process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASSWORD
      ? "smtp"
      : process.env.RESEND_API_KEY
        ? "resend"
        : "none") as EmailProvider,
  };
}
