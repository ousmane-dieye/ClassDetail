"use server";

/**
 * Paramètres → Mon profil & Mon compte — Server Actions de gestion du profil.
 *
 * Sécurité :
 *   - l'identité est TOUJOURS relevée côté serveur (`supabase.auth.getUser()`) ;
 *   - aucun user_id n'est accepté depuis le navigateur ;
 *   - seuls first_name et last_name sont modifiables depuis le profil ;
 *   - role, class_id, email, approved status ne peuvent pas être modifiés ici ;
 *   - la mise à jour de l'email utilise Supabase Auth (pas seulement `profiles`).
 */

import { createClient } from "@/lib/supabase/server";
import { updateProfileSchema, changePasswordSchema } from "@/lib/validation/schemas";
import { revalidatePath } from "next/cache";

export type ProfileActionResult = { success: true } | { error: string };

/**
 * Mise à jour des informations personnelles (prénom, nom uniquement).
 * Toute tentative de modifier role, class_id ou email est ignorée côté schéma.
 */
export async function updateProfileAction(formData: FormData): Promise<ProfileActionResult> {
  const parsed = updateProfileSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide" };
  }

  const { firstName, lastName } = parsed.data;

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Vous devez être connecté pour modifier votre profil." };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ first_name: firstName, last_name: lastName })
    .eq("id", user.id);

  if (error) {
    return { error: "La mise à jour a échoué. Réessayez dans quelques instants." };
  }

  // Invalider le layout (initiales dans le header) + la page profil.
  revalidatePath("/dashboard", "layout");
  revalidatePath("/dashboard/settings/profile");

  return { success: true };
}

/**
 * Changement de mot de passe depuis une session active (dashboard).
 * Utilise `supabase.auth.updateUser` — le mot de passe actuel n'est pas
 * redemandé car la session Supabase garantit l'identité.
 * Après succès, la session reste active (pas de déconnexion forcée).
 */
export async function changePasswordInDashboardAction(
  formData: FormData
): Promise<ProfileActionResult> {
  const parsed = changePasswordSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide" };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Vous devez être connecté pour modifier votre mot de passe." };
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });

  if (error) {
    if (error.message.toLowerCase().includes("same password")) {
      return { error: "Le nouveau mot de passe doit être différent de l'actuel." };
    }
    return { error: "La mise à jour du mot de passe a échoué. Réessayez dans quelques instants." };
  }

  return { success: true };
}
