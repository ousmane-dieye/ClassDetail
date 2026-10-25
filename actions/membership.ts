"use server";

/**
 * Paramètres → Ma classe — Server Actions d'appartenance à une classe.
 *
 * Sécurité (migration 0019) :
 *   - l'identité est TOUJOURS relevée côté serveur depuis la session
 *     (`supabase.auth.getUser()`) — aucun identifiant d'utilisateur n'est
 *     accepté depuis le navigateur ;
 *   - les mutations passent par des fonctions SQL SECURITY DEFINER
 *     exécutables uniquement par `service_role`, donc uniquement d'ici ;
 *   - chaque fonction RÉVÉRIFIE les conditions métier (rôle, classe,
 *     statut de la demande) au moment de l'écriture, sous verrouillage.
 */

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { classTransferSchema } from "@/lib/validation/schemas";
import { revalidatePath } from "next/cache";
import type { MembershipActionResult } from "@/lib/business/membership";
import type { MembershipTransitionResult } from "@/types/database.types";

const GENERIC_ERROR = "L'opération a échoué. Réessayez dans quelques instants.";

const LEAVE_ERROR_MESSAGES: Record<string, string> = {
  INVALID_INPUT: "Requête invalide. Rechargez la page puis réessayez.",
  PROFILE_NOT_FOUND: "Profil introuvable. Reconnectez-vous puis réessayez.",
  ADMIN_BLOCKED:
    "Votre compte administrateur n'est pas rattaché à une classe depuis les paramètres.",
  DELEGATE_BLOCKED:
    "Vous êtes délégué de cette classe : faites d'abord révoquer votre rôle par un administrateur (Administration → Gestion des Délégués), puis revenez quitter la classe.",
  NO_CLASS: "Vous n'appartenez déjà à aucune classe.",
};

const REQUEST_ERROR_MESSAGES: Record<string, string> = {
  INVALID_INPUT: "Requête invalide. Rechargez la page puis réessayez.",
  PROFILE_NOT_FOUND: "Profil introuvable. Reconnectez-vous puis réessayez.",
  ROLE_BLOCKED:
    "Seuls les étudiants peuvent demander à rejoindre ou changer de classe. Un délégué doit d'abord faire révoquer son rôle.",
  CLASS_NOT_FOUND: "Cette classe n'existe pas ou a été supprimée. Choisissez-en une autre.",
  SAME_CLASS: "Vous appartenez déjà à cette classe.",
  PENDING_EXISTS:
    "Une demande est déjà en attente de validation. Annulez-la d'abord pour en soumettre une nouvelle.",
};

const CANCEL_ERROR_MESSAGES: Record<string, string> = {
  INVALID_INPUT: "Requête invalide. Rechargez la page puis réessayez.",
  NOT_FOUND: "Cette demande est introuvable ou n'appartient pas à votre compte.",
  NOT_PENDING: "Cette demande a déjà été traitée : elle ne peut plus être annulée.",
};

function mapError(messages: Record<string, string>, code?: string): string {
  return (code && messages[code]) || GENERIC_ERROR;
}

function refreshedPaths() {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/settings/class");
}

/**
 * Quitte sa classe. Interdit aux ADMIN (compte global) et aux DELEGATE
 * (la classe perdrait son délégué : révocation préalable requise).
 */
export async function leaveClassAction(): Promise<MembershipActionResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Vous devez être connecté pour quitter une classe." };
  }

  const { data, error } = await createAdminClient().rpc("classpulse_leave_class", {
    p_user_id: user.id,
  });
  if (error) return { error: "Le départ n'a pas pu être effectué : " + error.message };

  const result = data as MembershipTransitionResult | null;
  if (result?.status !== "ok") {
    return { error: mapError(LEAVE_ERROR_MESSAGES, result?.code) };
  }

  refreshedPaths();
  return { success: true };
}

/**
 * Demande de rejoindre une classe (sans classe actuelle) OU de changer de
 * classe (la classe actuelle est conservée jusqu'à l'acceptation).
 */
export async function requestClassTransferAction(
  formData: FormData
): Promise<MembershipActionResult> {
  const parsed = classTransferSchema.safeParse({ classId: formData.get("classId") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Veuillez sélectionner une classe." };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Vous devez être connecté pour envoyer une demande." };
  }

  const { data, error } = await createAdminClient().rpc("classpulse_request_class_change", {
    p_user_id: user.id,
    p_target_class_id: parsed.data.classId,
  });
  if (error) return { error: "La demande n'a pas pu être enregistrée : " + error.message };

  const result = data as MembershipTransitionResult | null;
  if (result?.status !== "ok") {
    return { error: mapError(REQUEST_ERROR_MESSAGES, result?.code) };
  }

  refreshedPaths();
  return { success: true };
}

/** Annule sa propre demande encore PENDING. */
export async function cancelClassRequestAction(requestId: string): Promise<MembershipActionResult> {
  if (typeof requestId !== "string" || requestId.trim().length === 0) {
    return { error: CANCEL_ERROR_MESSAGES.INVALID_INPUT! };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Vous devez être connecté pour annuler une demande." };
  }

  const { data, error } = await createAdminClient().rpc("classpulse_cancel_request", {
    p_user_id: user.id,
    p_request_id: requestId,
  });
  if (error) return { error: "La demande n'a pas pu être annulée : " + error.message };

  const result = data as MembershipTransitionResult | null;
  if (result?.status !== "ok") {
    return { error: mapError(CANCEL_ERROR_MESSAGES, result?.code) };
  }

  refreshedPaths();
  return { success: true };
}
