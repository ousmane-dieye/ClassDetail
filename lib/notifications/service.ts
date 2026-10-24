/**
 * NotificationService — service générique de création de notifications.
 *
 * Règles :
 *   - Toute notification est créée via createNotification() (un seul point d'entrée).
 *   - Le client "service role" est utilisé : la RLS du créateur ne limite pas
 *     l'écriture (les notifications vers d'autres utilisateurs passent par le backend).
 *   - Chaque notification porte : type, titre, message, entité (type/id) et lien.
 *   - Une catégorie est dérivée du type pour le filtrage du centre de notifications.
 *
 * PRÉFÉRENCES DE CANAUX (lib/notifications/preferences.ts) :
 *   - createNotification : le canal interne est vérifié POUR LE DESTINATAIRE
 *     avant toute insertion (les types système — inscription, rôle — ne sont
 *     jamais filtrés : ils n'appartiennent à aucune catégorie).
 *   - notifyClassMembers : une seule lecture groupée des préférences de la
 *     classe ; les notifications internes ne sont créées que pour les
 *     destinataires qui l'ont activée, puis les emails sont dispatchés
 *     (lib/email/dispatch.ts) pour ceux qui ont activé le canal e-mail — si
 *     et seulement si le type possède réellement un canal e-mail.
 *   - Si la lecture des préférences échoue, ce sont les VALEURS PAR DÉFAUT qui
 *     s'appliquent (jamais une coupure généralisée, jamais une ouverture
 *     générale) — voir loadChannels().
 *
 * ⚠️ Module serveur uniquement (importe lib/supabase/admin).
 */

import { createAdminClient } from "@/lib/supabase/admin";
import type { NotificationCategory, NotificationType } from "@/types/database.types";
import {
  isEmailCapableType,
  loadChannels,
  preferenceCategoryOf,
} from "@/lib/notifications/preferences";
import { sendClassEventEmails } from "@/lib/email/dispatch";

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  /** Type d'entité liée (ex: "task", "document", "conversation"). */
  entityType?: string | null;
  /** Identifiant de l'entité liée (ex: task_id). */
  entityId?: string | null;
  /** Lien interne de navigation vers l'élément. */
  link?: string | null;
  /** Surcharge éventuelle de la catégorie (sinon dérivée du type). */
  category?: NotificationCategory;
}

const TYPE_CATEGORY: Record<NotificationType, NotificationCategory> = {
  TASK_CREATED: "tasks",
  ASSIGNMENT_CREATED: "tasks",
  ASSIGNMENT_UPDATED: "tasks",
  TASK_REMINDER: "tasks",
  TASK_COMPLETED: "tasks",
  COURSE_SAVED: "courses",
  COURSE_UPDATED: "courses",
  RECORDING_ADDED: "courses",
  DOCUMENT_ADDED: "documents",
  HINT_ADDED: "hints",
  ANNOUNCEMENT_CREATED: "announcements",
  REGISTRATION_ACCEPTED: "system",
  REGISTRATION_REJECTED: "system",
  DELEGATE_APPOINTED: "system",
  DELEGATE_REMOVED: "system",
  SCHEDULE_PUBLISHED: "schedule",
  SCHEDULE_UPDATED: "schedule",
  SESSION_CANCELLED: "schedule",
  EVALUATION_PUBLISHED: "evaluations",
  EVALUATION_UPDATED: "evaluations",
  EVALUATION_CANCELLED: "evaluations",
};

/** Catégorie de filtre dérivée du type de notification. */
export function notificationCategoryOf(type: NotificationType): NotificationCategory {
  return TYPE_CATEGORY[type] ?? "system";
}

/** Crée une notification pour un utilisateur (canal interne vérifié). */
export async function createNotification(input: CreateNotificationInput): Promise<{ id: string } | null> {
  if (!input.userId || !input.type || !input.title) return null;

  // Événement pédagogique → respect de la préférence « Dans ClassPulse ».
  // Événement système (null) → jamais filtré (authentification, rôle).
  const preferenceCategory = preferenceCategoryOf(input.type);
  if (preferenceCategory) {
    const channels = await loadChannels([input.userId], preferenceCategory);
    if (!channels.get(input.userId)?.inApp) return null;
  }

  const { data, error } = await createAdminClient()
    .from("notifications")
    .insert({
      recipient_id: input.userId,
      type: input.type,
      title: input.title,
      message: input.message,
      entity_type: input.entityType ?? null,
      entity_id: input.entityId ?? null,
      link: input.link ?? null,
      category: input.category ?? notificationCategoryOf(input.type),
    })
    .select("id")
    .single();

  if (error) {
    console.error("NotificationService : échec de création (userId=%s, type=%s) : %s", input.userId, input.type, error.message);
    return null;
  }
  return { id: data.id };
}

export interface NotifyClassMembersResult {
  /** Notifications internes réellement créées. */
  created: number;
  /** Emails réellement acceptés par le fournisseur. */
  emailsSent: number;
  /** Emails non tentés (canal désactivé, déjà envoyés ou fournisseur absent). */
  emailsSkipped: number;
  /** Emails en échec. */
  emailsFailed: number;
}

/**
 * Crée une notification pour TOUS les membres d'une classe (sauf exclusion),
 * en appliquant les préférences individuelles, puis dispatche l'email de
 * l'événement si la catégorie en prévoit un.
 *
 * Retourne le nombre de notifications internes créées (compatibilité avec les
 * actions existantes qui exposent `notified`).
 */
export async function notifyClassMembers(
  input: Omit<CreateNotificationInput, "userId"> & { classId: string; excludeUserId?: string }
): Promise<number> {
  const { created } = await notifyClassMembersDetailed(input);
  return created;
}

/** Variante détaillée (internes + emails) pour les actions qui veulent les deux. */
export async function notifyClassMembersDetailed(
  input: Omit<CreateNotificationInput, "userId"> & { classId: string; excludeUserId?: string }
): Promise<NotifyClassMembersResult> {
  const empty: NotifyClassMembersResult = { created: 0, emailsSent: 0, emailsSkipped: 0, emailsFailed: 0 };
  const { classId, excludeUserId, ...notification } = input;
  if (!notification.type || !notification.title) return empty;

  const { data: members } = await createAdminClient()
    .from("profiles")
    .select("id, email, first_name")
    .eq("class_id", classId);

  const recipients = (members ?? []).filter((m) => !excludeUserId || m.id !== excludeUserId);
  if (recipients.length === 0) return empty;

  const category = notification.category ?? notificationCategoryOf(notification.type);
  const preferenceCategory = preferenceCategoryOf(notification.type);

  // Une seule lecture des préférences pour toute la classe.
  const channels = preferenceCategory
    ? await loadChannels(
        recipients.map((m) => m.id),
        preferenceCategory
      )
    : null;

  const inAppRecipients = channels
    ? recipients.filter((m) => channels.get(m.id)?.inApp ?? true)
    : recipients;

  const emailRecipients =
    channels && isEmailCapableType(notification.type)
      ? recipients.filter((m) => channels.get(m.id)?.email === true)
      : [];

  const result: NotifyClassMembersResult = { ...empty };

  // ── 1. Canal interne ──
  if (inAppRecipients.length > 0) {
    const rows = inAppRecipients.map((member) => ({
      recipient_id: member.id,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      entity_type: notification.entityType ?? null,
      entity_id: notification.entityId ?? null,
      link: notification.link ?? null,
      category,
    }));

    const { error } = await createAdminClient().from("notifications").insert(rows);

    if (error) {
      // Échec d'écriture : journalisé, mais le canal e-mail reste indépendant
      // (les deux canaux ne se bloquent jamais mutuellement).
      console.error(
        "NotificationService : batch insert failed for class %s: %s",
        classId,
        error.message
      );
    } else {
      result.created = inAppRecipients.length;
    }
  }

  // ── 2. Canal e-mail (si la catégorie en prévoit un et si l'utilisateur
  //      l'a activé) — jamais bloquant pour l'action métier. ──
  if (emailRecipients.length > 0) {
    try {
      const dispatch = await sendClassEventEmails({
        recipients: emailRecipients.map((m) => ({
          id: m.id,
          email: m.email,
          firstName: m.first_name,
        })),
        type: notification.type,
        heading: notification.title,
        message: notification.message,
        buttonUrl: notification.link ?? null,
        entityType: notification.entityType ?? null,
        entityId: notification.entityId ?? null,
        assignmentId: notification.entityType === "task" ? (notification.entityId ?? null) : null,
      });
      result.emailsSent = dispatch.sent;
      result.emailsSkipped = dispatch.skipped;
      result.emailsFailed = dispatch.failed;
      if (dispatch.errors.length > 0) {
        console.error("NotificationService : emails en échec — %s", dispatch.errors.join(" | "));
      }
    } catch (error) {
      // Un échec d'email ne doit jamais annuler ni dupliquer la notification.
      console.error(
        "NotificationService : dispatch email impossible (class=%s, type=%s) : %s",
        classId,
        notification.type,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  return result;
}
