/**
 * Validation côté serveur de Cloudflare Turnstile.
 * 
 * SÉCURITÉ : La validation se fait EXCLUSIVEMENT côté serveur.
 * Le client ne peut pas falsifier cette réponse car la clé secrète (TURNSTILE_SECRET_KEY)
 * n'est jamais exposée au frontend.
 */

export interface TurnstileVerificationResult {
  success: boolean;
  error?: string;
  skipped?: boolean;
}

export async function verifyTurnstileToken(
  token: string | null | undefined,
  remoteIp?: string
): Promise<TurnstileVerificationResult> {
  const secretKey = process.env.TURNSTILE_SECRET_KEY;

  // Si aucune clé secrète n'est configurée dans l'environnement, le CAPTCHA est ignoré (mode dégradé fluide).
  if (!secretKey) {
    return { success: true, skipped: true };
  }

  if (!token || typeof token !== "string" || !token.trim()) {
    return { success: false, error: "Jeton Turnstile manquant ou invalide" };
  }

  try {
    const formData = new URLSearchParams();
    formData.append("secret", secretKey);
    formData.append("response", token.trim());
    if (remoteIp) {
      formData.append("remoteip", remoteIp);
    }

    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: formData,
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
    });

    if (!response.ok) {
      return { success: false, error: `Erreur API Turnstile (${response.status})` };
    }

    const outcome = (await response.json()) as { success: boolean; "error-codes"?: string[] };

    if (!outcome.success) {
      const errorMsg = outcome["error-codes"]?.join(", ") ?? "Échec validation CAPTCHA";
      return { success: false, error: errorMsg };
    }

    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erreur réseau Turnstile";
    console.error("Vérification Turnstile impossible :", message);
    // Fail-closed pour les vérifications Turnstile si la clé secrète est configurée
    return { success: false, error: "Service CAPTCHA indisponible" };
  }
}
