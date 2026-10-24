"use server";

import { createClient } from "@/lib/supabase/server";
import { notificationPreferencesSchema } from "@/lib/validation/schemas";
import { revalidatePath } from "next/cache";

/**
 * Server Actions des préférences de notifications (Paramètres → Notifications).
 *
 * SÉCURITÉ
 *   - L'utilisateur est identifié par la SESSION (supabase.auth.getUser()),
 *     jamais par un `user_id` fourni par le navigateur.
 *   - L'écriture passe par le client de l'utilisateur : la RLS
 *     (`user_id = auth.uid()`, migration 0018) est le garde-fou final — un
 *     administrateur ne peut pas modifier les préférences d'autrui et il est
 *     impossible de cibler un autre compte.
 *   - Validation Zod stricte : catégorie inconnue, booléen absent ou doublon
 *     → rejet, aucune écriture.
 *
 * NOTE : la réinitialisation SUPPRIME les lignes de l'utilisateur (retour aux
 * valeurs par défaut de ClassPulse) sans toucher à aucune autre donnée du
 * compte (tâches, documents, notifications…).
 */

type ActionResult = { success: true } | { error: string };

const SETTINGS_PATH = "/dashboard/settings/notifications";

export async function saveNotificationPreferencesAction(input: unknown): Promise<ActionResult> {
  const parsed = notificationPreferencesSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Préférences invalides" };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Non authentifié" };

  const rows = parsed.data.preferences.map((entry) => ({
    user_id: user.id, // toujours la session, jamais le payload
    category: entry.category,
    in_app_enabled: entry.inAppEnabled,
    email_enabled: entry.emailEnabled,
  }));

  const { error } = await supabase
    .from("notification_preferences")
    .upsert(rows, { onConflict: "user_id,category" });

  if (error) {
    console.error("NotificationPreferences : enregistrement impossible : %s", error.message);
    return { error: "Enregistrement impossible. Vos préférences n'ont pas été modifiées." };
  }

  revalidatePath(SETTINGS_PATH);
  return { success: true };
}

export async function resetNotificationPreferencesAction(): Promise<ActionResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Non authentifié" };

  // RLS : seules les lignes de l'utilisateur connecté peuvent être supprimées.
  const { error } = await supabase.from("notification_preferences").delete().eq("user_id", user.id);

  if (error) {
    console.error("NotificationPreferences : réinitialisation impossible : %s", error.message);
    return { error: "Réinitialisation impossible. Vos préférences n'ont pas été modifiées." };
  }

  revalidatePath(SETTINGS_PATH);
  return { success: true };
}
