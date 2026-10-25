/**
 * Messages d'erreur d'authentification explicites (français).
 *
 * PRINCIPE — un message d'erreur doit dire à l'utilisateur CE QU'IL DOIT FAIRE,
 * pas seulement que « quelque chose a échoué ». L'ancien message unique
 * (« Identifiants invalides ou trop de tentatives ») mélangeait trois causes
 * totalement différentes : saisi faux, quota dépassé, service en panne —
 * impossible de savoir quoi corriger.
 *
 * Deux familles de causes sont donc distinguées :
 *   1. quota dépassé / garde-fou indisponible → message dédié, avec le délai
 *      d'attente réel et la règle en vigueur ;
 *   2. identifiants refusés par Supabase Auth → message dédié, qui cite les
 *      deux saisies à vérifier.
 *
 * ANTI-ÉNUMÉRATION inchangée : « email inconnu » et « mot de passe incorrect »
 * partagent LE MÊME message (impossible de tester l'existence d'un compte),
 * mais ce message liste explicitement les causes possibles et la marche à
 * suivre (vérification des deux champs, réinitialisation).
 */

import { AUTH_RATE_LIMIT_CONFIG } from "@/lib/security/rateLimit";

const windowLabel = (windowMs: number) => Math.round(windowMs / 60_000);

/** Convertit une attente en millisecondes en consigne lisible. */
export function formatRetryDelay(retryAfterMs?: number): string {
  if (!retryAfterMs || retryAfterMs <= 0) {
    return "Réessayez dans quelques minutes.";
  }
  const seconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
  if (seconds <= 60) {
    return `Réessayez dans ${seconds} seconde${seconds > 1 ? "s" : ""}.`;
  }
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) {
    return `Réessayez dans ${minutes} minute${minutes > 1 ? "s" : ""}.`;
  }
  const hours = Math.ceil(minutes / 60);
  return `Réessayez dans ${hours} heure${hours > 1 ? "s" : ""}.`;
}

export interface RateLimitMessageInput {
  /** Quota atteint sur l'IP de l'appareil ou sur le compte visé. */
  bucket?: "ip" | "account";
  /** Temps restant avant réinitialisation du quota, en ms. */
  retryAfterMs?: number;
  /** true = le garde-fou lui-même est indisponible (fail-closed). */
  unavailable?: boolean;
}

/** Message quand le rate limiting bloque la connexion (quota ou panne du garde-fou). */
export function rateLimitErrorMessage({ bucket, retryAfterMs, unavailable }: RateLimitMessageInput): string {
  if (unavailable) {
    return (
      "Connexion refusée par sécurité : le service de protection anti-brute-force est momentanément " +
      "indisponible. Aucun problème avec vos identifiants — réessayez dans une minute."
    );
  }

  const delay = formatRetryDelay(retryAfterMs);

  if (bucket === "account") {
    const { LIMIT, WINDOW_MS } = AUTH_RATE_LIMIT_CONFIG.LOGIN_ACCOUNT;
    return (
      `Trop de tentatives de connexion pour ce compte (${LIMIT} maximum toutes les ` +
      `${windowLabel(WINDOW_MS)} minutes) : compte verrouillé temporairement pour bloquer les tentatives ` +
      `automatisées. Vérifiez votre mot de passe (ou utilisez « Mot de passe oublié ? » si vous ne le ` +
      `retrouvez plus). ${delay}`
    );
  }

  const { LIMIT, WINDOW_MS } = AUTH_RATE_LIMIT_CONFIG.LOGIN_IP;
  return (
    `Trop de tentatives de connexion depuis cet appareil ou ce réseau (${LIMIT} maximum toutes les ` +
    `${windowLabel(WINDOW_MS)} minutes). ${delay}`
  );
}

/** Message quand Supabase Auth lui-même a ralenti/refusé la connexion (anti-abus). */
export function tooManyAttemptsMessage(): string {
  return (
    "Trop de tentatives de connexion rapprochées. Attendez environ une minute avant de réessayer, " +
    "ou réinitialisez votre mot de passe."
  );
}

/** Message quand les identifiants sont refusés (email inconnu OU mot de passe faux). */
export function invalidCredentialsMessage(): string {
  return (
    "Identifiants incorrects : cette adresse email n'est associée à aucun compte ClassPulse OU le " +
    "mot de passe saisi ne correspond pas. Vérifiez les deux champs (le mot de passe doit contenir au " +
    "moins 6 caractères), et utilisez « Mot de passe oublié ? » si besoin."
  );
}

interface AuthErrorLike {
  code?: string | null;
  message?: string | null;
}

/** Traduit l'erreur de `signInWithPassword` en message français actionnable. */
export function loginFailureErrorMessage(error: AuthErrorLike | null | undefined): string {
  const code = (error?.code ?? "").toLowerCase();
  const message = (error?.message ?? "").toLowerCase();

  if (code === "email_not_confirmed" || message.includes("email not confirmed")) {
    return (
      "Adresse email non confirmée : ouvrez le lien de confirmation reçu dans votre boîte de " +
      "réception (et dans vos spams), puis reconnectez-vous."
    );
  }

  if (code === "user_banned" || code === "user_disabled" || message.includes("banned")) {
    return (
      "Compte suspendu : cet accès a été désactivé par un administrateur. Contactez " +
      "l'administration de votre établissement pour rétablir votre compte."
    );
  }

  if (
    code === "over_request_rate_limit" ||
    code === "over_email_send_rate_limit" ||
    code === "rate_limit_exceeded" ||
    message.includes("rate limit")
  ) {
    return tooManyAttemptsMessage();
  }

  if (code === "invalid_credentials" || code === "user_not_found" || code === "invalid_grant") {
    return invalidCredentialsMessage();
  }

  // Cause inconnue (évolution de l'API, panne…) : message utile sans afficher
  // un libellé technique anglais brut à l'utilisateur. La cause réelle est
  // journalisée côté serveur (logSecurityEvent AUTH_LOGIN_FAILED).
  if (code || message) {
    return (
      "Connexion impossible pour le moment : identifiants non vérifiés (mot de passe peut-être " +
      "invalide ou service d'authentification indisponible). Réessayez, vérifiez vos deux saisies, " +
      "ou réinitialisez votre mot de passe."
    );
  }

  return invalidCredentialsMessage();
}

/** Traduit l'erreur de `signUp` (création de compte) en message français actionnable. */
export function signUpErrorMessage(error: AuthErrorLike | null | undefined): string {
  const code = (error?.code ?? "").toLowerCase();
  const message = (error?.message ?? "").toLowerCase();

  if (code === "user_already_exists" || message.includes("already registered")) {
    return "Cette adresse email est déjà utilisée. Connectez-vous, ou réinitialisez votre mot de passe.";
  }
  if (code === "weak_password" || message.includes("password should be at least")) {
    return (
      "Mot de passe refusé : 6 caractères minimum sont requis pour la création du compte. " +
      "Choisissez un mot de passe plus long, puis réessayez."
    );
  }
  if (code === "email_address_invalid" || message.includes("email address invalid")) {
    return "Adresse email invalide : vérifiez le format saisi (ex. : etudiant@ecole.fr).";
  }
  if (code === "over_request_rate_limit" || message.includes("rate limit")) {
    return tooManyAttemptsMessage();
  }

  return (
    "La création du compte a échoué : vérifiez l'adresse email et le mot de passe (6 caractères " +
    "minimum), puis réessayez. Si l'erreur persiste, réessayez dans quelques minutes."
  );
}

/** Traduit l'erreur de `updateUser` (changement de mot de passe) en message français actionnable. */
export function updatePasswordErrorMessage(error: AuthErrorLike | null | undefined): string {
  const code = (error?.code ?? "").toLowerCase();
  const message = (error?.message ?? "").toLowerCase();

  if (code === "same_password" || message.includes("different from the old password")) {
    return (
      "Ce mot de passe est identique à l'actuel : choisissez un nouveau mot de passe différent " +
      "(6 caractères minimum)."
    );
  }
  if (code === "weak_password" || message.includes("password should be at least")) {
    return "Mot de passe trop court : 6 caractères minimum. Choisissez un mot de passe plus long.";
  }
  if (code === "over_request_rate_limit" || message.includes("rate limit")) {
    return tooManyAttemptsMessage();
  }

  return (
    "La mise à jour du mot de passe a échoué : vérifiez les deux saisies (6 caractères minimum, " +
    "identiques dans les deux champs), puis réessayez."
  );
}
