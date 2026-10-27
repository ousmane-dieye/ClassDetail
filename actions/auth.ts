"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loginSchema, registerSchema, resubmitSchema, forgotPasswordSchema, resetPasswordSchema } from "@/lib/validation/schemas";
import { createNotification } from "@/lib/notifications/service";
import { handleRegistrationDecisionEmail } from "@/lib/email/notifications";
import { canValidateRegistration } from "@/lib/business/permissions";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getClientIp } from "@/lib/security/ip";
import { checkAuthLoginRateLimits, checkPasswordResetRateLimits } from "@/lib/security/rateLimit";
import {
  loginFailureErrorMessage,
  rateLimitErrorMessage,
  signUpErrorMessage,
  updatePasswordErrorMessage,
} from "@/lib/security/authMessages";
import { verifyTurnstileToken } from "@/lib/security/turnstile";
import { logSecurityEvent } from "@/lib/security/logger";
import type { MembershipTransitionResult } from "@/types/database.types";

/** Codes retour de classpulse_decide_request → messages destinés à l'utilisateur. */
const DECIDE_ERROR_MESSAGES: Record<string, string> = {
  INVALID_INPUT: "Demande invalide",
  INVALID_DECISION: "Décision invalide",
  NOT_FOUND: "Demande introuvable",
  NOT_PENDING: "Cette demande a déjà été traitée (décision définitive).",
  FORBIDDEN: "Vous n'êtes pas autorisé à traiter cette demande.",
};

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

  const appOrigin = (process.env.APP_URL || "https://classdetail.vercel.app").replace(/\/+$/, "");
  // 1. Création du compte Supabase Auth
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${appOrigin}/dashboard/student`,
    },
  });

  if (authError || !authData.user) {
    return { error: signUpErrorMessage(authError) };
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
    return { error: rateLimitErrorMessage(rateLimitResult) };
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
    // Anti-énumération : aucun message distinguant « email inconnu » de
    // « mot de passe incorrect » (impossible de tester l'existence d'un
    // compte), mais chaque cause reste explicite et actionnable.
    return { error: loginFailureErrorMessage(error) };
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
  const origin = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");

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
    return { error: updatePasswordErrorMessage(error) };
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
 * Traite une demande d'inscription OU de changement de classe
 * (ADMIN, ou DELEGATE de la classe demandée).
 *
 * Sécurité (correction P-020 / P-021 — docs/audit-classepulse/05-securite.md) :
 *   1. la session est vérifiée (aucun identifiant d'utilisateur accepté du
 *      navigateur) ;
 *   2. la lecture RLS de la demande sert de premier filtre (un ADMIN voit
 *      tout, un DELEGATE uniquement les demandes de SA classe) puis
 *      l'autorisation est vérifiée explicitement (canValidateRegistration) ;
 *   3. la transition est réalisée par `classpulse_decide_request`
 *      (SECURITY DEFINER, service_role) qui RÉVÉRIFIE, sous verrouillage, que
 *      la demande est encore PENDING et que l'appelant est ADMIN ou délégué de
 *      la classe demandée, puis accepte atomiquement : demande validée +
 *      clôture de l'ancienne appartenance + ouverture de la nouvelle +
 *      mise à jour du profil ;
 *   4. AUCUN effet de bord service role (notification, email) n'est exécuté si
 *      la transition a échoué — le résultat du RPC fait foi.
 *
 * `previous_class_id` distingue une inscription (JOIN) d'un changement
 * de classe (CHANGE) : le compte étant déjà approuvé, un changement accepté
 * ne renvoie pas l'email d'activation d'accès.
 */
export async function decideRegistrationAction(
  requestId: string,
  decision: "ACCEPTED" | "REJECTED"
) {
  if (typeof requestId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId)) {
    return { error: "Demande invalide" };
  }
  if (decision !== "ACCEPTED" && decision !== "REJECTED") {
    return { error: "Décision invalide" };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Non authentifié" };

  // 2 requêtes indépendantes → parallélisées (profil de l'appelant + demande).
  const [{ data: actor }, { data: request, error: fetchError }] = await Promise.all([
    supabase.from("profiles").select("role, class_id").eq("id", user.id).single(),
    supabase
      .from("registration_requests")
      .select(
        "*, profiles!registration_requests_user_id_fkey(first_name, last_name), classes!registration_requests_class_id_fkey(name)"
      )
      .eq("id", requestId)
      .single(),
  ]);

  if (!actor) return { error: "Profil introuvable" };
  if (fetchError || !request) return { error: "Demande introuvable" };
  if (request.status !== "PENDING") {
    return { error: "Cette demande a déjà été traitée (décision définitive)." };
  }
  if (
    !canValidateRegistration(
      { id: user.id, role: actor.role, classId: actor.class_id },
      request.class_id
    )
  ) {
    return { error: "Vous n'êtes pas autorisé à traiter cette demande." };
  }

  const { data, error: rpcError } = await createAdminClient().rpc("classpulse_decide_request", {
    p_request_id: requestId,
    p_decider_id: user.id,
    p_decision: decision,
  });
  if (rpcError) return { error: "La décision n'a pas pu être enregistrée : " + rpcError.message };

  const result = data as MembershipTransitionResult | null;
  if (result?.status !== "ok") {
    return { error: DECIDE_ERROR_MESSAGES[result?.code ?? ""] ?? "La décision n'a pas pu être enregistrée." };
  }

  const isChange = result.request_kind === "CHANGE";
  const studentFirstName = request.profiles?.first_name ?? "";
  const studentLastName = request.profiles?.last_name ?? "";
  const className = request.classes?.name ?? "";

  if (decision === "ACCEPTED") {
    const admin = createAdminClient();

    // Email du demandeur : non sélectionnable par le client (RLS colonne).
    const { data: studentRow } = await admin
      .from("profiles")
      .select("email")
      .eq("id", request.user_id)
      .maybeSingle();
    const studentEmail = studentRow?.email ?? null;

    // Notification + email → parallélisés.
    await Promise.all([
      createNotification({
        userId: request.user_id,
        type: "REGISTRATION_ACCEPTED",
        title: isChange ? "Changement de classe accepté" : "Inscription acceptée",
        message: isChange
          ? `Votre demande de changement de classe a été acceptée. Vous êtes désormais membre de ${className}.`
          : "Votre demande d'inscription a été validée. Bienvenue sur ClassPulse !",
        entityType: "registration_request",
        entityId: request.id,
        link: "/dashboard/settings/class",
      }),
      // Un changement concerne un compte DÉJÀ accepté : l'email d'activation
      // d'accès reste réservé à une première inscription.
      studentEmail && !isChange
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
      title: isChange ? "Changement de classe refusé" : "Inscription refusée",
      message: isChange
        ? `Votre demande de changement de classe vers ${className} a été refusée. Vous restez membre de votre classe actuelle.`
        : "Votre demande d'inscription a été refusée. Vous pouvez en soumettre une nouvelle.",
      entityType: "registration_request",
      entityId: request.id,
      link: "/dashboard/settings/class",
    });
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/settings/class");
  return { success: true };
}
