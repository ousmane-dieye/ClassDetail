"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { createNotification } from "@/lib/notifications/service";

export type AdminStudentActionResult = { success: true } | { error: string };

/**
 * Retirer un étudiant (ou délégué) de sa classe.
 *
 * Règles métier & Sécurité :
 *   1. Réservé aux administrateurs vérifiés côté serveur (`role === 'ADMIN'`).
 *   2. Impossible de retirer un ADMIN (comptes système globaux).
 *   3. Si l'étudiant retiré était DELEGATE, il est automatiquement déchu de son rôle
 *      de délégué et repasse STUDENT (un délégué ne peut pas être sans classe).
 *   4. L'historique d'appartenance dans `class_members` est clos (`left_at = now()`).
 *   5. Toute demande d'inscription/transfert `PENDING` pour ce compte est annulée (`CANCELLED`).
 *   6. Le profil voit son `class_id` réinitialisé à `null`.
 *   7. Dès cet instant, les politiques RLS (`is_member_of()`) bloquent tout accès
 *      aux données privées de son ancienne classe (matières, chat, devoirs, etc.).
 *   8. Le compte Auth et le profil sont préservés : l'étudiant peut continuer à se connecter,
 *      consulter son profil et demander à rejoindre une autre classe.
 */
export async function removeStudentFromClassAction(targetUserId: string): Promise<AdminStudentActionResult> {
  if (!targetUserId || typeof targetUserId !== "string") {
    return { error: "Identifiant d'étudiant invalide." };
  }

  const supabase = createClient();
  const {
    data: { user: callerUser },
  } = await supabase.auth.getUser();

  if (!callerUser) {
    return { error: "Vous devez être connecté pour effectuer cette opération." };
  }

  // Vérification stricte des autorisations de l'administrateur
  const { data: callerProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", callerUser.id)
    .single();

  if (!callerProfile || callerProfile.role !== "ADMIN") {
    return { error: "Accès refusé : privilèges administrateur requis." };
  }

  const adminClient = createAdminClient();

  // Chargement du profil cible
  const { data: targetProfile, error: targetError } = await adminClient
    .from("profiles")
    .select("id, role, class_id, first_name, last_name")
    .eq("id", targetUserId)
    .single();

  if (targetError || !targetProfile) {
    return { error: "Étudiant introuvable dans la base de données." };
  }

  if (targetProfile.role === "ADMIN") {
    return { error: "Sécurité : impossible de modifier l'appartenance d'un administrateur." };
  }

  if (!targetProfile.class_id) {
    return { error: "Cet étudiant n'appartient déjà à aucune classe." };
  }

  const oldClassId = targetProfile.class_id;
  const wasDelegate = targetProfile.role === "DELEGATE";
  const nowIso = new Date().toISOString();

  // 1. Clôture de l'appartenance active dans class_members
  await adminClient
    .from("class_members")
    .update({ left_at: nowIso })
    .eq("user_id", targetUserId)
    .eq("class_id", oldClassId)
    .is("left_at", null);

  // 2. Annulation de toute demande PENDING restante
  await adminClient
    .from("registration_requests")
    .update({
      status: "CANCELLED",
      decided_at: nowIso,
      decided_by: callerUser.id,
    })
    .eq("user_id", targetUserId)
    .eq("status", "PENDING");

  // 3. Mise à jour du profil : class_id = null et rétrogradation en STUDENT si délégué
  const { error: updateError } = await adminClient
    .from("profiles")
    .update({
      class_id: null,
      role: "STUDENT",
    })
    .eq("id", targetUserId);

  if (updateError) {
    console.error("[removeStudentFromClassAction] Erreur update profile:", updateError);
    return { error: "Impossible de retirer l'étudiant de la classe. Réessayez." };
  }

  // 4. Si c'était un délégué, notification d'information
  if (wasDelegate) {
    await createNotification({
      userId: targetUserId,
      type: "DELEGATE_REMOVED",
      title: "Rôle délégué révoqué",
      message: "Votre rôle de délégué a pris fin suite à votre retrait de la classe par l'administration.",
      link: "/dashboard/settings/class",
    });
  }

  revalidatePath("/dashboard/admin");
  revalidatePath("/dashboard");
  return { success: true };
}

/**
 * Supprimer définitivement un compte étudiant.
 *
 * Règles métier & Sécurité :
 *   1. Réservé aux administrateurs autorisés (`role === 'ADMIN'`).
 *   2. Auto-suppression interdite : un admin ne peut pas supprimer son propre compte.
 *   3. Protection stricte : interdiction absolue de supprimer un compte ADMIN.
 *   4. Résolution des contraintes référentielles (P-007) :
 *      - `registration_requests.decided_by` est mis à NULL pour ne pas bloquer la suppression.
 *      - `chat_messages` de l'auteur sont supprimés pour éviter la violation `author_id NOT NULL`.
 *      - Les ressources collectives partagées (`tasks`, `documents`, `hints`, `recordings`,
 *        `announcements`, `schedule_sessions`, `evaluations`) créées par le compte (si ex-délégué)
 *        sont réattribuées à l'administrateur appelant : les devoirs et plannings de la classe
 *        sont ainsi préservés sans rompre les clés étrangères.
 *   5. Suppression de l'utilisateur dans Supabase Auth (`supabase.auth.admin.deleteUser`).
 *   6. La suppression Auth cascade vers `profiles` et les données personnelles privées
 *      (complétions, soumissions, préférences de notifications, chats assistant).
 */
export async function deleteStudentAccountAction(targetUserId: string): Promise<AdminStudentActionResult> {
  if (!targetUserId || typeof targetUserId !== "string") {
    return { error: "Identifiant d'étudiant invalide." };
  }

  const supabase = createClient();
  const {
    data: { user: callerUser },
  } = await supabase.auth.getUser();

  if (!callerUser) {
    return { error: "Vous devez être connecté pour effectuer cette opération." };
  }

  // Vérification de l'administrateur
  const { data: callerProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", callerUser.id)
    .single();

  if (!callerProfile || callerProfile.role !== "ADMIN") {
    return { error: "Accès refusé : privilèges administrateur requis." };
  }

  // Protection auto-suppression
  if (callerUser.id === targetUserId) {
    return { error: "Opération impossible : vous ne pouvez pas supprimer votre propre compte administrateur." };
  }

  const adminClient = createAdminClient();

  // Chargement du profil cible
  const { data: targetProfile, error: targetError } = await adminClient
    .from("profiles")
    .select("id, role, first_name, last_name, email")
    .eq("id", targetUserId)
    .single();

  if (targetError || !targetProfile) {
    return { error: "Compte étudiant introuvable." };
  }

  // Protection absolue des comptes administrateurs
  if (targetProfile.role === "ADMIN") {
    return { error: "Protection de sécurité : impossible de supprimer un compte administrateur." };
  }

  try {
    // 1. Découpler decided_by dans les demandes d'inscription
    await adminClient
      .from("registration_requests")
      .update({ decided_by: null })
      .eq("decided_by", targetUserId);

    // 2. Nettoyer les messages de chat personnels (author_id NOT NULL)
    await adminClient
      .from("chat_messages")
      .delete()
      .eq("author_id", targetUserId);

    // 3. Réattribution administrative des contenus collectifs (si l'étudiant était délégué)
    const untypedAdmin = adminClient as any;
    await Promise.all([
      adminClient.from("tasks").update({ creator_id: callerUser.id }).eq("creator_id", targetUserId),
      adminClient.from("documents").update({ author_id: callerUser.id }).eq("author_id", targetUserId),
      adminClient.from("hints").update({ author_id: callerUser.id }).eq("author_id", targetUserId),
      adminClient.from("recordings").update({ creator_id: callerUser.id }).eq("creator_id", targetUserId),
      untypedAdmin.from("announcements").update({ created_by: callerUser.id }).eq("created_by", targetUserId),
      untypedAdmin.from("schedule_sessions").update({ created_by: callerUser.id }).eq("created_by", targetUserId),
      untypedAdmin.from("evaluations").update({ created_by: callerUser.id }).eq("created_by", targetUserId),
    ]);

    // 4. Clôture de l'appartenance
    await adminClient
      .from("class_members")
      .delete()
      .eq("user_id", targetUserId);

    // 5. Suppression de l'utilisateur dans Supabase Auth
    const { error: authDeleteError } = await adminClient.auth.admin.deleteUser(targetUserId);

    if (authDeleteError) {
      console.warn("[deleteStudentAccountAction] Auth deleteUser warning:", authDeleteError.message);
      // Tentative de suppression directe dans la table profiles si le compte Auth est déjà absent
      const { error: profileDeleteError } = await adminClient
        .from("profiles")
        .delete()
        .eq("id", targetUserId);

      if (profileDeleteError) {
        return {
          error: `Échec de suppression du compte : ${authDeleteError.message || profileDeleteError.message}`,
        };
      }
    } else {
      // S'assurer que le profil est purgé au cas où le déclencheur cascade ait un délai
      await adminClient
        .from("profiles")
        .delete()
        .eq("id", targetUserId);
    }

    revalidatePath("/dashboard/admin");
    revalidatePath("/dashboard");
    return { success: true };
  } catch (err: any) {
    console.error("[deleteStudentAccountAction] Erreur inattendue:", err);
    return { error: "Une erreur est survenue lors de la suppression du compte." };
  }
}
