import { redirect } from "next/navigation";
import { Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/PageHeader";
import { AccountSection, type AccountData } from "@/components/settings/AccountSection";

export const metadata = {
  title: "Compte & Sécurité — Paramètres — ClassPulse",
};

/**
 * Dashboard → Paramètres → Compte & Sécurité.
 *
 * Page serveur : lit les métadonnées de sécurité de la session Supabase Auth
 * (email, dates de connexion, statut de vérification) et offre l'accès au
 * changement de mot de passe sécurisé et à la déconnexion.
 */
export default async function AccountSettingsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const accountData: AccountData = {
    email: user.email ?? "",
    createdAt: user.created_at ?? null,
    lastSignInAt: user.last_sign_in_at ?? null,
    emailConfirmedAt: user.email_confirmed_at ?? null,
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Lock}
        title="Compte & Sécurité"
        description="Gérez la sécurité de votre compte, votre mot de passe et vos sessions actives."
      />
      <AccountSection account={accountData} />
    </div>
  );
}
