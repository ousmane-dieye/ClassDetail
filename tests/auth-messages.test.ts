import { describe, it, expect } from "vitest";
import {
  PASSWORD_MIN_LENGTH,
  registerSchema,
  resetPasswordSchema,
} from "@/lib/validation/schemas";
import {
  formatRetryDelay,
  invalidCredentialsMessage,
  loginFailureErrorMessage,
  rateLimitErrorMessage,
  signUpErrorMessage,
  tooManyAttemptsMessage,
  updatePasswordErrorMessage,
} from "@/lib/security/authMessages";
import { AUTH_RATE_LIMIT_CONFIG } from "@/lib/security/rateLimit";

// ---------------------------------------------------------------------------
// Tests — politiques de mot de passe (6 caractères) + messages d'erreur
// explicites. Le point de ces tests : chaque message doit dire à l'utilisateur
// QU'ELLE EST LA RÈGLE ENJOINTE et CE QU'IL DOIT FAIRE, jamais un simple
// « échec » ou un « 12 caractères minimum » sans rapport avec la saisie.
// ---------------------------------------------------------------------------

const registration = (password: string, confirmPassword = password) => ({
  firstName: "Amadou",
  lastName: "Diallo",
  email: "amadou@ecole.fr",
  password,
  confirmPassword,
  classId: "3c9b0f8e-1a2b-4c5d-8e7f-000000000001",
});

describe("Politique de mot de passe", () => {
  it("la longueur minimale commune (serveur, formulaire, Supabase) est de 6 caractères", () => {
    expect(PASSWORD_MIN_LENGTH).toBe(6);
  });

  it("un mot de passe de 6 caractères est accepté à l'inscription", () => {
    const result = registerSchema.safeParse(registration("da2024sn"));
    expect(result.success).toBe(true);
  });

  it("un mot de passe de 5 caractères est refusé avec la règle ET la longueur saisie", () => {
    const result = registerSchema.safeParse(registration("da202"));
    expect(result.success).toBe(false);
    const message = result.success ? "" : (result.error.issues[0]?.message ?? "");
    expect(message).toContain("6 caractères minimum");
    expect(message).toContain("saisi 5");
  });

  it("la réinitialisation applique la même règle que l'inscription", () => {
    expect(resetPasswordSchema.safeParse({ password: "da2024sn", confirmPassword: "da2024sn" }).success).toBe(true);

    const tropCourt = resetPasswordSchema.safeParse({ password: "da202", confirmPassword: "da202" });
    expect(tropCourt.success).toBe(false);
    expect(tropCourt.success ? "" : (tropCourt.error.issues[0]?.message ?? "")).toContain("6 caractères minimum");
  });

  it("un mot de passe différent de la confirmation explique quoi corriger", () => {
    const result = registerSchema.safeParse(registration("da2024sn", "da2024sx"));
    expect(result.success).toBe(false);
    const messages = result.success ? [] : result.error.issues.map((i) => i.message);
    expect(messages.join(" ")).toContain("ne correspondent pas");
    expect(messages.join(" ")).toContain("les deux champs");
  });
});

describe("Messages de connexion (loginAction)", () => {
  it("identifiants refusés : les deux causes possibles sont citées, avec la marche à suivre", () => {
    const message = invalidCredentialsMessage();
    expect(message).toContain("cette adresse email");
    expect(message).toContain("mot de passe");
    expect(message).toContain("6 caractères");
    expect(message).toContain("Mot de passe oublié");
  });

  it("email non confirmé : dit d'ouvrir le lien reçu par email", () => {
    const message = loginFailureErrorMessage({ code: "email_not_confirmed", message: "Email not confirmed" });
    expect(message).toContain("non confirmée");
    expect(message).toContain("lien de confirmation");
  });

  it("compte suspendu : dit qui contacter", () => {
    const message = loginFailureErrorMessage({ code: "user_banned", message: "User is banned" });
    expect(message).toContain("suspendu");
    expect(message).toContain("administrateur");
  });

  it("limite atteinte côté Supabase : message de patience, pas « identifiants invalides »", () => {
    const message = loginFailureErrorMessage({ code: "over_request_rate_limit", message: "rate limit" });
    expect(message).toBe(tooManyAttemptsMessage());
    expect(message).toContain("Trop de tentatives");
  });

  it("erreur inconnue : message français actionnable (jamais un libellé technique brut)", () => {
    const message = loginFailureErrorMessage({ code: "some_new_code", message: "Something broke" });
    expect(message).toContain("Réessayez");
    expect(message).toContain("mot de passe");
    expect(message).not.toContain("Something broke");
  });
});

describe("Messages de rate limiting", () => {
  it("précise le quota en vigueur, la fenêtre et le délai restant (compte)", () => {
    const { LIMIT, WINDOW_MS } = AUTH_RATE_LIMIT_CONFIG.LOGIN_ACCOUNT;
    const message = rateLimitErrorMessage({ bucket: "account", retryAfterMs: 4 * 60_000 });
    expect(message).toContain(`(${LIMIT} maximum`);
    expect(message).toContain(`${Math.round(WINDOW_MS / 60_000)} minutes`);
    expect(message).toContain("4 minutes");
    expect(message).toContain("Mot de passe oublié");
  });

  it("précise le quota en vigueur et le délai restant (IP)", () => {
    const { LIMIT } = AUTH_RATE_LIMIT_CONFIG.LOGIN_IP;
    const message = rateLimitErrorMessage({ bucket: "ip", retryAfterMs: 30_000 });
    expect(message).toContain(`(${LIMIT} maximum`);
    expect(message).toContain("30 secondes");
  });

  it("panne du garde-fou : dit explicitement que ce n'est PAS l'utilisateur en cause", () => {
    const message = rateLimitErrorMessage({ unavailable: true, retryAfterMs: 60_000 });
    expect(message).toContain("indisponible");
    expect(message).toContain("vos identifiants");
    expect(message).toContain("réessayez");
  });

  it("formatRetryDelay formate secondes, minutes, heures et valeur absente", () => {
    expect(formatRetryDelay(undefined)).toContain("quelques minutes");
    expect(formatRetryDelay(1_000)).toContain("1 seconde");
    expect(formatRetryDelay(45_000)).toContain("45 secondes");
    expect(formatRetryDelay(9 * 60_000)).toContain("9 minutes");
    expect(formatRetryDelay(3 * 3_600_000)).toContain("3 heures");
  });
});

describe("Messages d'inscription et de réinitialisation", () => {
  it("signUp — mot de passe trop faible refusé par Supabase : dit la règle", () => {
    const message = signUpErrorMessage({ code: "weak_password", message: "Password should be at least 6 characters" });
    expect(message).toContain("6 caractères minimum");
    expect(message).not.toContain("Password should be");
  });

  it("signUp — email déjà utilisé : dit quoi faire", () => {
    const message = signUpErrorMessage({ code: "user_already_exists", message: "User already registered" });
    expect(message).toContain("déjà utilisée");
  });

  it("updatePassword — même mot de passe : dit de choisir un autre mot de passe", () => {
    const message = updatePasswordErrorMessage({
      code: "same_password",
      message: "New password should be different from the old password",
    });
    expect(message).toContain("identique");
    expect(message).toContain("différent");
  });

  it("updatePassword — erreur inconnue : message français orienté correction", () => {
    const message = updatePasswordErrorMessage({ message: "unexpected failure" });
    expect(message).toContain("échoué");
    expect(message).toContain("6 caractères minimum");
    expect(message).not.toContain("unexpected failure");
  });
});
