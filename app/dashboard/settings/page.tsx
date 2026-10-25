import { redirect } from "next/navigation";

/**
 * Racine du module Paramètres : redirige vers la section principale
 * (« Mon profil »). Les autres sections (Compte & Sécurité, Notifications,
 * Ma classe) sont accessibles depuis la barre d'onglets unifiée.
 */
export default function SettingsIndexPage() {
  redirect("/dashboard/settings/profile");
}
