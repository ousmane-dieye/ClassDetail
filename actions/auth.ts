"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loginSchema, registerSchema } from "@/lib/validation/schemas";
import { createNotification } from "@/lib/notifications/service";
import { handleRegistrationDecisionEmail } from "@/lib/email/notifications";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

export async function registerAction(formData: FormData) {
  const parsed = registerSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
    classId: formData.get("classId"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide" };
  }

  const { firstName, lastName, email, password, classId } = parsed.data;
  const supabase = createClient();

  // 1. Création du compte Supabase Auth
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
  });

  if (authError || !authData.user) {
    return { error: authError?.message ?? "Erreur lors de la création du compte" };
  }

  // 2. Premier utilisateur de l'app ? -> ADMIN automatique, compte directement
  //    validé (sinon personne ne pourrait jamais valider la toute première
  //    inscription). Les utilisateurs suivants restent STUDENT en attente
  //    de validation par un ADMIN ou un DELEGATE.
  const admin = createAdminClient();
  const { count: adminCount } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "ADMIN");
  const isFirstUser = adminCount === 0;

  // Sécurité : un compte en attente n'a PAS de class_id — il n'est rattaché à
  // sa classe qu'au moment de l'acceptation (decideRegistrationAction). Un
  // utilisateur PENDING ne passe aucune policy RLS basée sur is_member_of.
  const { error: profileError } = await admin.from("profiles").insert({
    id: authData.user.id,
    first_name: firstName,
    last_name: lastName,
    email,
    role: isFirstUser ? "ADMIN" : "STUDENT",
    class_id: isFirstUser ? classId : null,
  });

  if (profileError) {
    return { error: "Erreur lors de la création du profil : " + profileError.message };
  }

  if (!isFirstUser) {
    // 3. Demande d'inscription PENDING (sauf pour le tout premier ADMIN)
    const { error: reqError } = await admin.from("registration_requests").insert({
      user_id: authData.user.id,
      class_id: classId,
      status: "PENDING",
    });

    if (reqError) {
      return { error: "Erreur lors de la demande d'inscription : " + reqError.message };
    }

    redirect("/pending");
  }

  redirect("/dashboard");
}

export async function loginAction(formData: FormData) {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide" };
  }

  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    return { error: "Email ou mot de passe incorrect" };
  }

  revalidatePath("/dashboard");
  redirect("/dashboard");
}

export async function logoutAction() {
  const supabase = createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

/**
 * Traite une demande d'inscription (ADMIN ou DELEGATE de la classe concernée).
 * La RLS garantit qu'un DELEGATE ne peut agir que sur sa propre classe.
 */
export async function decideRegistrationAction(
  requestId: string,
  decision: "ACCEPTED" | "REJECTED"
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Non authentifié" };

  // L'email n'est pas sélectionnable par le client (RLS colonne) : on le lira
  // via le service role après vérification de la permission (voir plus bas).
  const { data: request, error: fetchError } = await supabase
    .from("registration_requests")
    .select("*, profiles!registration_requests_user_id_fkey(first_name, last_name), classes(name)")
    .eq("id", requestId)
    .single();

  if (fetchError || !request) return { error: "Demande introuvable" };
  if (request.status !== "PENDING") {
    return { error: "Cette demande a déjà été traitée (décision définitive)." };
  }

  const { error: updateError } = await supabase
    .from("registration_requests")
    .update({ status: decision, decided_by: user.id, decided_at: new Date().toISOString() })
    .eq("id", requestId)
    .eq("status", "PENDING"); // garde-fou anti double-décision (course condition)

  if (updateError) return { error: updateError.message };

  const studentFirstName = request.profiles?.first_name ?? "";
  const studentLastName = request.profiles?.last_name ?? "";
  const className = request.classes?.name ?? "";

  if (decision === "ACCEPTED") {
    // Rattaché le profil à sa classe (lecture de l'email via service role,
    // seul à pouvoir lire la colonne email).
    const admin = createAdminClient();
    const { data: studentRow } = await admin
      .from("profiles")
      .select("email")
      .eq("id", request.user_id)
      .maybeSingle();
    const studentEmail = studentRow?.email ?? null;

    if (request.class_id) {
      await admin
        .from("profiles")
        .update({ class_id: request.class_id })
        .eq("id", request.user_id);
    }

    await createNotification({
      userId: request.user_id,
      type: "REGISTRATION_ACCEPTED",
      title: "Inscription acceptée",
      message: "Votre demande d'inscription a été validée. Bienvenue sur ClassPulse !",
    });
    if (studentEmail) {
      try {
        // Email automatique depuis l'adresse admin, avec anti-doublon
        // (un AUTHENTICATION_APPROVED SENT ne sera jamais renvoyé).
        await handleRegistrationDecisionEmail({
          decision,
          userId: request.user_id,
          email: studentEmail,
          firstName: studentFirstName,
          lastName: studentLastName,
        });
      } catch (e) {
        console.error("Erreur envoi email de validation :", e);
      }
    }
  } else {
    // Refus : notification interne uniquement, aucun email envoyé.
    await createNotification({
      userId: request.user_id,
      type: "REGISTRATION_REJECTED",
      title: "Inscription refusée",
      message: "Votre demande d'inscription a été refusée. Vous pouvez en soumettre une nouvelle.",
    });
  }

  revalidatePath("/dashboard");
  return { success: true };
}
