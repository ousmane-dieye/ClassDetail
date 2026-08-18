import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// F3 — Échange du lien de récupération envoyé par Supabase Auth.
//
// Le lien de l'email pointe ici (redirectTo de resetPasswordForEmail). On
// échange le code/token côté serveur — le token n'est donc JAMAIS visible
// dans l'URL finale — puis on redirige vers l'écran de nouveau mot de passe.
//
// Deux mécanismes de lien sont gérés (selon la configuration Supabase) :
//   - PKCE (défaut) : paramètre `code` -> exchangeCodeForSession ;
//   - token_hash : paramètres `token_hash` + `type` -> verifyOtp.
// Tout échec (lien invalide, expiré, déjà consommé) mène vers /recovery-error.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const code = searchParams.get("code");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/";

  // Destination finale, sans les paramètres d'authentification.
  const redirectTo = request.nextUrl.clone();
  redirectTo.pathname = next;
  redirectTo.searchParams.delete("token_hash");
  redirectTo.searchParams.delete("type");
  redirectTo.searchParams.delete("code");
  redirectTo.searchParams.delete("next");

  const supabase = createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(redirectTo);
  }

  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) return NextResponse.redirect(redirectTo);
  }

  redirectTo.pathname = "/recovery-error";
  return NextResponse.redirect(redirectTo);
}
