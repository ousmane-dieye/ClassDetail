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
 * ⚠️ Module serveur uniquement (importe lib/supabase/admin).
 */

import { createAdminClient } from "@/lib/supabase/admin";
import type { NotificationCategory, NotificationType } from "@/types/database.types";

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
};

/** Catégorie de filtre dérivée du type de notification. */
export function notificationCategoryOf(type: NotificationType): NotificationCategory {
  return TYPE_CATEGORY[type] ?? "system";
}

/** Crée une notification pour un utilisateur. */
export async function createNotification(input: CreateNotificationInput): Promise<{ id: string } | null> {
  if (!input.userId || !input.type || !input.title) return null;

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

/** Crée une notification pour TOUS les membres d'une classe (sauf exclusion). */
export async function notifyClassMembers(input: Omit<CreateNotificationInput, "userId"> & { classId: string; excludeUserId?: string }): Promise<number> {
  const { classId, excludeUserId, ...notification } = input;

  const { data: members } = await createAdminClient()
    .from("profiles")
    .select("id")
    .eq("class_id", classId);

  const recipients = (members ?? [])
    .filter((m) => !excludeUserId || m.id !== excludeUserId)
    .map((m) => m.id);

  if (recipients.length === 0) return 0;

  const category = notification.category ?? notificationCategoryOf(notification.type);

  const rows = recipients.map((userId) => ({
    recipient_id: userId,
    type: notification.type,
    title: notification.title,
    message: notification.message,
    entity_type: notification.entityType ?? null,
    entity_id: notification.entityId ?? null,
    link: notification.link ?? null,
    category,
  }));

  const { error } = await createAdminClient()
    .from("notifications")
    .insert(rows);

  if (error) {
    console.error("NotificationService : batch insert failed for class %s: %s", classId, error.message);
    return 0;
  }
  return recipients.length;
}

