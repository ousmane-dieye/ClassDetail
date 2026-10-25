import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertCircle, RefreshCw, School } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/PageHeader";
import { MyClassSection } from "@/components/settings/MyClassSection";
import {
  resolveMembershipView,
  type ClassOption,
  type MembershipRequestSnapshot,
} from "@/lib/business/membership";

export const metadata = {
  title: "Ma classe — Paramètres — ClassPulse",
};

type RequestRow = {
  id: string;
  class_id: string;
  previous_class_id: string | null;
  status: MembershipRequestSnapshot["status"];
  created_at: string;
  decided_at: string | null;
  classes: { name: string } | null;
  previous_class: { name: string } | null;
};

/**
 * Dashboard → Paramètres → Ma classe.
 *
 * Page serveur : l'état affiché est relu à chaque navigation (aucune valeur
 * mise en cache côté client). Les actions sont déléguées à
 * `components/settings/MyClassSection` qui appelle les Server Actions de
 * `actions/membership.ts`.
 */
export default async function MyClassSettingsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, class_id")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    return (
      <div className="space-y-6">
        <PageHeader
          icon={School}
          title="Ma classe"
          description="Consultez et modifiez votre appartenance à une classe."
        />
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-2xl border border-danger/40 bg-danger/8 p-5 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-start gap-3">
            <AlertCircle size={18} className="mt-0.5 shrink-0 text-danger" />
            <div>
              <p className="text-sm font-semibold text-danger">Impossible de charger votre classe</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                Aucune modification n&apos;a été appliquée. Réessayez dans quelques instants.
              </p>
            </div>
          </div>
          <Link
            href="/dashboard/settings/class"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-border bg-background px-3.5 py-2 text-xs font-semibold text-foreground transition-all hover:border-primary/35 hover:text-primary"
          >
            <RefreshCw size={14} strokeWidth={2} />
            Réessayer
          </Link>
        </div>
      </div>
    );
  }

  // 3 requêtes indépendantes → parallélisées.
  const [classesResult, membershipResult, requestsResult] = await Promise.all([
    supabase.from("classes").select("id, name, level, academic_year").order("name"),
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
      .select(
        "id, class_id, previous_class_id, status, created_at, decided_at, " +
          "classes!registration_requests_class_id_fkey(name), " +
          "previous_class:classes!registration_requests_previous_class_id_fkey(name)"
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const classes: ClassOption[] = (
    (classesResult.data ?? []) as Array<{
      id: string;
      name: string;
      level: string;
      academic_year: string;
    }>
  ).map((c) => ({
    id: c.id,
    name: c.name,
    level: c.level,
    academicYear: c.academic_year,
  }));
  const currentClass = classes.find((c) => c.id === profile.class_id) ?? null;

  const requests: MembershipRequestSnapshot[] = (
    (requestsResult.data ?? []) as unknown as RequestRow[]
  ).map((row) => ({
      id: row.id,
      classId: row.class_id,
      previousClassId: row.previous_class_id,
      status: row.status,
      createdAt: row.created_at,
      decidedAt: row.decided_at,
      className: row.classes?.name ?? null,
      previousClassName: row.previous_class?.name ?? null,
    })
  );

  const view = resolveMembershipView({
    role: profile.role,
    classId: profile.class_id,
    className: currentClass?.name ?? null,
    classLevel: currentClass?.level ?? null,
    academicYear: currentClass?.academicYear ?? null,
    memberSince:
      (membershipResult.data?.joined_at as string | undefined) ?? null,
    requests,
    classes,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        icon={School}
        title="Ma classe"
        description="Consultez votre classe actuelle, demandez à la quitter ou à en rejoindre une autre."
      />
      <MyClassSection view={view} />
    </div>
  );
}
