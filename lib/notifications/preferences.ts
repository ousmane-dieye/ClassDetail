/**
 * PRÉFÉRENCES DE NOTIFICATIONS — accès aux données (lecture serveur).
 *
 * Les définitions partagées (identifiants, valeurs par défaut, libellés,
 * mapping type → catégorie) vivent dans
 * `lib/constants/notificationPreferences.ts` — ce module ne contient que la
 * persistance, pour rester importable côté serveur sans rien charger dans le
 * bundle client.
 *
 * Règles :
 *   - Une préférence ABSENTE = valeur par défaut de ClassPulse (comptes
 *     créés avant la migration : rien n'est perdu, rien n'est créé).
 *   - Une préférence enregistrée est TOUJOURS respectée.
 *   - MODE DÉGRADÉ DOCUMENTÉ : si la lecture échoue (base indisponible), on
 *     journalise l'erreur et on applique les VALEURS PAR DÉFAUT — jamais une
 *     désactivation silencieuse de tous les canaux, jamais une ouverture
 *     générale. Une erreur de lecture n'est jamais comptée comme un envoi.
 *
 * ⚠️ Module serveur uniquement (importe lib/supabase/admin).
 */

import { createAdminClient } from "@/lib/supabase/admin";
import {
  DEFAULT_CHANNELS,
  resolveChannels,
  type Channels,
  type PreferenceCategory,
} from "@/lib/constants/notificationPreferences";

export {
  CATEGORY_META,
  DEFAULT_CHANNELS,
  NOTIFICATION_PREFERENCE_CATEGORIES,
  isEmailCapableType,
  isPreferenceCategory,
  preferenceCategoryOf,
  resolveChannels,
} from "@/lib/constants/notificationPreferences";
export type { CategoryMeta, Channels, PreferenceCategory } from "@/lib/constants/notificationPreferences";

interface PreferenceRowLike {
  in_app_enabled?: boolean | null;
  email_enabled?: boolean | null;
}

/**
 * Lit les canaux effectifs d'UNE catégorie pour plusieurs utilisateurs —
 * une seule requête (performant pour un cron ou une classe entière).
 * En cas d'échec : journalise et retourne les valeurs par défaut.
 */
export async function loadChannels(
  userIds: string[],
  category: PreferenceCategory
): Promise<Map<string, Channels>> {
  const fallback = DEFAULT_CHANNELS[category];
  const withDefaults = (): Map<string, Channels> => {
    const map = new Map<string, Channels>();
    for (const userId of userIds) map.set(userId, { ...fallback });
    return map;
  };

  if (userIds.length === 0) return new Map();

  let rows: Array<{ user_id: string } & PreferenceRowLike> | null;

  try {
    const { data, error } = await createAdminClient()
      .from("notification_preferences")
      .select("user_id, in_app_enabled, email_enabled")
      .eq("category", category)
      .in("user_id", userIds);
    if (error) throw new Error(error.message);
    rows = data ?? [];
  } catch (error) {
    console.error(
      "NotificationPreferences : lecture impossible (%s) — application des valeurs par défaut : %s",
      category,
      error instanceof Error ? error.message : String(error)
    );
    return withDefaults();
  }

  const byUser = new Map<string, PreferenceRowLike>();
  for (const row of rows) byUser.set(row.user_id, row);

  const map = new Map<string, Channels>();
  for (const userId of userIds) {
    map.set(userId, resolveChannels(category, byUser.get(userId) ?? null));
  }
  return map;
}
