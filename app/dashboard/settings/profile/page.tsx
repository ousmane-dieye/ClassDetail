import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertCircle, RefreshCw, User } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/PageHeader";
import { ProfileSection, type ProfileData } from "@/components/settings/ProfileSection";

export const metadata = {
  title: "Mon profil — Paramètres — ClassPulse",
};

/**
 * Dashboard → Paramètres → Mon profil.
 *
 * Page serveur : lit le profil authentifié, ses informations de classe et
 * son statut d'adhésion. Les modifications de nom/prénom sont déléguées à
 * `components/settings/ProfileSection` (Server Action `updateProfileAction`).
 */
export default async function ProfileSettingsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Profil utilisateur (NB: la colonne `email` est restreinte au niveau colonne par la migration 0009 pour protéger la vie privée des étudiants ; l'email est extrait directement de `user.email` fourni par Supabase Auth)
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("first_name, last_name, role, class_id, created_at")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile) {
    if (profileError) {
      console.error("[ProfileSettingsPage] Erreur chargement profil:", profileError);
    }
    return (
      <div className="space-y-6">
        <PageHeader
          icon={User}
          title="Mon profil"
          description="Consultez et gérez vos informations personnelles et académiques."
        />
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-2xl border border-danger/40 bg-danger/8 p-5 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-start gap-3">
            <AlertCircle size={18} className="mt-0.5 shrink-0 text-danger" />
            <div>
              <p className="text-sm font-semibold text-danger">Impossible de charger votre profil</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                Une erreur est survenue lors de la récupération de vos données. Réessayez dans quelques instants.
              </p>
            </div>
          </div>
          <Link
            href="/dashboard/settings/profile"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-border bg-background px-3.5 py-2 text-xs font-semibold text-foreground transition-all hover:border-primary/35 hover:text-primary"
          >
            <RefreshCw size={14} strokeWidth={2} />
            Réessayer
          </Link>
        </div>
      </div>
    );
  }

  // Requêtes parallèles complémentaires : classe actuelle, adhésion et statut de demande
  const [classResult, membershipResult, requestResult] = await Promise.all([
    profile.class_id
      ? supabase
          .from("classes")
          .select("name, level, academic_year")
          .eq("id", profile.class_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    profile.class_id
      ? supabase
          .from("class_members")
          .select("joined_at")
          .eq("user_id", user.id)
          .eq("class_id", profile.class_id)
          .is("left_at", null)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from("registration_requests")
      .select("status")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const profileData: ProfileData = {
    firstName: profile.first_name,
    lastName: profile.last_name,
    email: user.email ?? "",
    role: profile.role,
    classId: profile.class_id,
    className: classResult.data?.name ?? null,
    classLevel: classResult.data?.level ?? null,
    academicYear: classResult.data?.academic_year ?? null,
    createdAt: profile.created_at ?? user.created_at ?? null,
    memberSince: membershipResult.data?.joined_at ?? null,
    approvalStatus: requestResult.data?.status ?? null,
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={User}
        title="Mon profil"
        description="Consultez et gérez vos informations personnelles et académiques."
      />
      <ProfileSection profile={profileData} />
    </div>
  );
}
