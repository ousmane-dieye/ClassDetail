"use server";

import { createClient } from "@/lib/supabase/server";
import { getSenderAddress, sendTestEmail } from "@/lib/email/emailService";

/**
 * Envoie un email de test vers l'adresse de l'administration (EMAIL_FROM)
 * ou vers une adresse explicitement autorisée (EMAIL_TEST_ALLOWLIST).
 * Réservé à un ADMIN authentifié — aucune autre adresse ne peut être ciblée
 * (protection contre l'envoi abusif).
 */
export async function sendTestEmailAction(formData: FormData): Promise<{
  ok: boolean;
  to?: string;
  steps?: { ok: boolean; label: string; detail?: string }[];
  error?: string;
}> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Non authentifié" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "ADMIN") {
    return { ok: false, error: "Réservé aux administrateurs" };
  }

  const requestedTo = String(formData.get("to") ?? "").trim();
  const target = isTestTargetAllowed(requestedTo) ? requestedTo : getSenderAddress();

  const result = await sendTestEmail(target);
  return {
    ok: result.ok,
    to: result.to,
    steps: result.steps,
    error: result.error,
  };
}

function isTestTargetAllowed(to: string): boolean {
  if (!to) return false;
  const allowlist = (process.env.EMAIL_TEST_ALLOWLIST || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return allowlist.includes(to.toLowerCase());
}
