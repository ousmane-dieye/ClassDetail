"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loginSchema, registerSchema, resubmitSchema, forgotPasswordSchema, resetPasswordSchema } from "@/lib/validation/schemas";
import { createNotification } from "@/lib/notifications/service";
import { handleRegistrationDecisionEmail } from "@/lib/email/notifications";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getClientIp } from "@/lib/security/ip";
import { checkAuthLoginRateLimits, checkPasswordResetRateLimits } from "@/lib/security/rateLimit";
import { verifyTurnstileToken } from "@/lib/security/turnstile";
import { logSecurityEvent } from "@/lib/security/logger";

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
  const admin = createAdminClient();

  // 0. Unicité de l'email : vérification explicite AVANT de créer le compte.
  //    signUp() peut retourner un utilisateur existant sans erreur (protection
  //    anti-énumération), et la contrainte DB est sensible à la casse — d'où
  //    ce contrôle appliqué sur l'email normalisé (minuscules).
  const { data: existingProfile } = await admin
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (existingProfile) {
    return { error: "Cette adresse email est déjà utilisée. Connectez-vous pour soumettre une nouvelle demande." };
  }

  // 1. Création du compte Supabase Auth
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
  });

  if (authError || !authData.user) {
    return { error: authError?.message ?? "Erreur lors de la création du compte" };
  }

  // Garde-fou : si signUp a renvoyé un compte existant (email déjà pris mais
  // absent de profiles, ex. compte Auth orphelin), on ne crée pas de profil.
  const { data: authExisting } = await admin
    .from("profiles")
    .select("id")
    .eq("id", authData.user.id)
    .maybeSingle();

  if (authExisting) {
    return { error: "Cette adresse email est déjà utilisée. Connectez-vous pour soumettre une nouvelle demande." };
  }

  // 2. TOUT nouvel utilisateur passe par le workflow normal (S4) :
  //    - rôle STUDENT (jamais ADMIN automatiquement) ;
  //    - class_id NULL (un compte en attente n'a pas de classe ; il n'est
  //      rattaché à sa classe qu'à l'acceptation — decideRegistrationAction).
  //      Un utilisateur PENDING ne passe aucune policy RLS basée sur
  //      is_member_of ;
  //    - demande d'inscription PENDING (aucune exception « premier utilisateur »).
  //    La création d'un ADMIN est un acte EXPLICITE de l'administrateur
  //    système (scripts/create-admin.mjs ou SQL via le service role) — jamais
  //    dérivé de l'inscription publique.
  const { error: profileError } = await admin.from("profiles").insert({
    id: authData.user.id,
    first_name: firstName,
    last_name: lastName,
    email,
    role: "STUDENT",
    class_id: null,
  });

  if (profileError) {
    // 23505 = violation de contrainte unique (race condition : deux
    // inscriptions simultanées avec le même email).
    if (profileError.code === "23505") {
      return { error: "Cette adresse email est déjà utilisée." };
    }
    return { error: "Erreur lors de la création du profil : " + profileError.message };
  }

  // 3. Demande d'inscription PENDING (s'applique à tous, sans exception).
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

/**
 * F1 — Resoumission d'une demande après REJECTED (correction F1).
 *
 * Un utilisateur dont la dernière demande a été REJECTED peut soumettre une
 * NOUVELLE demande (sans créer de second compte Auth) :
 *   1. il est authentifié (session existante) ;
 *   2. sa demande la plus récente est REJECTED (ou il n'en a aucune) ;
 *   3. il choisit (à nouveau) sa classe ;
 *   4. une nouvelle ligne `registration_requests` PENDING est créée, les
 *      anciennes restent historisées ;
 *   5. le workflow redevient REJECTED -> PENDING -> validation -> ACCEPTED.
 *
 * GARANTIES SÉCURITÉ :
 *   - Compte déjà ACCEPTED : refus (décision définitive, aucun contournement).
 *   - Demande déjà PENDING : refus (le workflow reste 1 seule demande active ;
 *     l'index partiel uq_regreq_pending_per_user verrouille côté base).
 *   - Un ADMIN ne passe jamais par une demande d'inscription.
 *   - Le rôle reste STUDENT (S4) ; un REJECTED ne récupère aucun droit tant
 *     qu'aucune validation ACCEPTED n'existe (is_approved_member).
 */
export async function resubmitRegistrationAction(formData: FormData) {
  const parsed = resubmitSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    classId: formData.get("classId"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide" };
  }

  const { firstName, lastName, classId } = parsed.data;
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Veuillez vous connecter pour soumettre une nouvelle demande." };
  }

  const admin = createAdminClient();

  // 2 queries indépendantes → parallélisées
  const [{ data: profile }, { data: requests }] = await Promise.all([
    admin
      .from("profiles")
      .select("id, role")
      .eq("id", user.id)
      .maybeSingle(),
    admin
      .from("registration_requests")
      .select("id, status")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
  ]);

  if (!profile) {
    return { error: "Profil introuvable. Recontactez un administrateur." };
  }
  if (profile.role === "ADMIN") {
    return { error: "Votre compte administrateur est déjà actif." };
  }

  if (requests?.some((r) => r.status === "ACCEPTED")) {
    return { error: "Votre compte est déjà validé. Vous n'avez pas besoin de soumettre une nouvelle demande." };
  }
  if (requests?.some((r) => r.status === "PENDING")) {
    return { error: "Une demande est déjà en attente de validation." };
  }

  // Mise à jour du profil (prénom/nom) puis nouvelle demande PENDING.
  const { error: profileError } = await admin
    .from("profiles")
    .update({ first_name: firstName, last_name: lastName })
    .eq("id", user.id);

  if (profileError) {
    return { error: "Erreur lors de la mise à jour du profil : " + profileError.message };
  }

  const { error: reqError } = await admin.from("registration_requests").insert({
    user_id: user.id,
    class_id: classId,
    status: "PENDING",
  });

  if (reqError) {
    // 23505 = unique (déjà une demande PENDING) ; 23503 = classe inexistante.
    if (reqError.code === "23505") {
      return { error: "Une demande est déjà en attente de validation." };
    }
    if (reqError.code === "23503") {
      return { error: "Cette classe n'existe pas." };
    }
    return { error: "Erreur lors de la nouvelle demande : " + reqError.message };
  }

  redirect("/pending");
}

export async function loginAction(formData: FormData) {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide" };
  }

  const { email, password } = parsed.data;
  const ip = getClientIp();

  // 1. Protection Rate Limiting (IP + Compte)
  const rateLimitResult = await checkAuthLoginRateLimits({ ip, email });
  if (!rateLimitResult.allowed) {
    logSecurityEvent("AUTH_RATE_LIMITED", {
      ip,
      email,
      bucket: rateLimitResult.bucket,
      reason: rateLimitResult.unavailable ? "Infrastructure rate limit indisponible (fail-closed)" : "Seuil maximal de tentatives dépassé",
    });
    return { error: "Identifiants invalides ou trop de tentatives. Veuillez réessayer plus tard." };
  }

  // 2. Protection Turnstile / CAPTCHA (Validation serveur)
  const turnstileToken = formData.get("cf-turnstile-response") as string | null;
  if (turnstileToken || process.env.TURNSTILE_SECRET_KEY) {
    const turnstileResult = await verifyTurnstileToken(turnstileToken, ip);
    if (!turnstileResult.success) {
      logSecurityEvent("AUTH_CAPTCHA_FAILED", {
        ip,
        email,
        reason: turnstileResult.error ?? "Validation CAPTCHA invalide",
      });
      return { error: "Vérification de sécurité (CAPTCHA) invalide. Veuillez réessayer." };
    }
  }

  // 3. Authentification Supabase Auth
  const supabase = createClient();
  const { data: authData, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    logSecurityEvent("AUTH_LOGIN_FAILED", {
      ip,
      email,
      reason: error.message,
    });
    // Anti-énumération : message générique uniforme
    return { error: "Identifiants invalides ou trop de tentatives. Veuillez réessayer plus tard." };
  }

  logSecurityEvent("AUTH_LOGIN_SUCCESS", {
    ip,
    email,
    userId: authData.user?.id,
  });

  revalidatePath("/dashboard");
  redirect("/dashboard");
}

/**
 * F3 — Demande de réinitialisation du mot de passe (étape 1).
 *
 * Déclenche l'envoi d'un email de récupération par Supabase Auth.
 *
 * SÉCURITÉ : rate-limiting par IP (5/15min) et compte (3/15min). Le message retourné
 * est TOUJOURS neutre ({ success: true }) pour empêcher l'énumération de comptes.
 */
export async function requestPasswordResetAction(formData: FormData) {
  const parsed = forgotPasswordSchema.safeParse({
    email: formData.get("email"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Email invalide" };
  }

  const { email } = parsed.data;
  const ip = getClientIp();

  logSecurityEvent("AUTH_PASSWORD_RESET_REQUESTED", { ip, email });

  // Rate limit check pour réinitialisation
  const rateLimitResult = await checkPasswordResetRateLimits({ ip, email });
  if (!rateLimitResult.allowed) {
    logSecurityEvent("AUTH_PASSWORD_RESET_RATE_LIMITED", {
      ip,
      email,
      bucket: rateLimitResult.bucket,
    });
    // Anti-énumération : retour fixe { success: true }
    return { success: true };
  }

  const supabase = createClient();
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  // L'erreur réelle (compte inexistant, SMTP indisponible) est ignorée côté réponse client (anti-énumération).
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/confirm?next=/reset-password`,
  });

  return { success: true };
}

/**
 * F3 — Mise à jour du mot de passe (étape 3, page /reset-password).
 *
 * Le formulaire n'est accessible qu'avec une session valide (créée par
 * l'échange du lien de récupération dans /auth/confirm). updateUser modifie le
 * mot de passe de l'utilisateur connecté uniquement. Après succès, la session
 * est fermée et l'utilisateur doit se reconnecter avec son nouveau mot de
 * passe (fin du parcours LOGIN -> reset -> connexion).
 */
export async function updatePasswordAction(formData: FormData) {
  const parsed = resetPasswordSchema.safeParse({
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
    return { error: "Session invalide ou expirée. Relancez la procédure de récupération." };
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    return { error: error.message };
  }

  await supabase.auth.signOut();
  redirect("/login");
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
    const admin = createAdminClient();

    // 2 queries indépendantes → parallélisées (email + update class_id)
    const [{ data: studentRow }] = await Promise.all([
      admin
        .from("profiles")
        .select("email")
        .eq("id", request.user_id)
        .maybeSingle(),
      request.class_id
        ? admin
            .from("profiles")
            .update({ class_id: request.class_id })
            .eq("id", request.user_id)
        : Promise.resolve({ data: null, error: null }),
    ]);
    const studentEmail = studentRow?.email ?? null;

    // Notification + email → parallélisées
    await Promise.all([
      createNotification({
        userId: request.user_id,
        type: "REGISTRATION_ACCEPTED",
        title: "Inscription acceptée",
        message: "Votre demande d'inscription a été validée. Bienvenue sur ClassPulse !",
      }),
      studentEmail
        ? handleRegistrationDecisionEmail({
            decision,
            userId: request.user_id,
            email: studentEmail,
            firstName: studentFirstName,
            lastName: studentLastName,
          }).catch((e) => console.error("Erreur envoi email de validation :", e))
        : Promise.resolve(),
    ]);
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
