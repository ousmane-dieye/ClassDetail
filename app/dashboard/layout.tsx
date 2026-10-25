import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { dashboardGate } from "@/lib/business/membership";
import { Sidebar } from "@/components/Sidebar";
import { SidebarProvider } from "@/components/SidebarContext";
import { NotificationBell } from "@/components/NotificationBell";
import { AssistantFab } from "@/components/assistant/AssistantFab";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { Search, GraduationCap } from "lucide-react";
import Link from "next/link";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // 3 requêtes indépendantes → parallélisées
  const [profileResult, latestRequestResult, unreadResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("first_name, last_name, role, class_id")
      .eq("id", user.id)
      .single(),
    supabase
      .from("registration_requests")
      .select("status")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single(),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("recipient_id", user.id)
      .is("read_at", null),
  ]);

  const profile = profileResult.data;
  const latestRequest = latestRequestResult.data;
  const unreadCount = unreadResult.count;

  if (!profile) redirect("/login");

  // Un utilisateur qui possède une classe garde TOUJOURS accès au dashboard :
  // une demande de changement en attente ou refusée n'est pas un motif
  // d'exclusion (l'état s'affiche dans Paramètres → Ma classe).
  const gate = dashboardGate({
    classId: profile.class_id ?? null,
    latestRequestStatus: latestRequest?.status ?? null,
  });
  if (gate === "pending") redirect("/pending");
  if (gate === "register") redirect("/register");

  const initials = `${profile.first_name?.[0] ?? ""}${profile.last_name?.[0] ?? ""}`.toUpperCase() || "U";
  const roleLabel =
    profile.role === "ADMIN"
      ? "Administrateur"
      : profile.role === "DELEGATE"
      ? "Délégué de classe"
      : "Étudiant";

  const roleColor =
    profile.role === "ADMIN"
      ? "bg-danger/10 text-danger"
      : profile.role === "DELEGATE"
      ? "bg-warning/12 text-warning"
      : "bg-primary/10 text-primary";

  return (
    <SidebarProvider>
      <div className="flex min-h-screen flex-col md:flex-row bg-background">
        {/* Sidebar navigation — desktop ; bottom navigation mobile */}
        <Sidebar
          role={profile.role}
          unreadCount={unreadCount ?? 0}
          userName={`${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim()}
        />

        {/* Zone de contenu — flex-1 s'adapte automatiquement à la largeur de la sidebar */}
        <div className="flex flex-1 flex-col overflow-x-hidden min-w-0">
          {/* En-tête supérieur */}
          <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border/70 bg-background/85 px-4 py-3 backdrop-blur-md md:px-8">
            <div className="flex items-center gap-3">
              <Link
                href="/dashboard"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-sm font-extrabold text-primary-foreground shadow-subtle transition-all hover:scale-105"
                title="Aller au tableau de bord"
              >
                {initials}
              </Link>
              <div className="hidden sm:block">
                <p className="font-display text-sm font-bold leading-tight text-foreground">
                  {profile.first_name} {profile.last_name}
                </p>
                <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${roleColor}`}>
                  {roleLabel}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                aria-label="Rechercher"
                className="hidden h-9 w-9 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground transition-all hover:border-primary/30 hover:text-foreground sm:flex"
              >
                <Search size={16} />
              </button>

              <ThemeToggle />
              <NotificationBell userId={user.id} initialUnreadCount={unreadCount ?? 0} />
            </div>
          </header>

          {/* Contenu des pages — marge basse mobile pour dépasser la bottom navigation */}
          <main className="mobile-nav-offset mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6 md:p-8 animate-fade-in">
            {children}
          </main>

          {/* Pied de page (desktop) */}
          <footer className="hidden border-t border-border/50 px-8 py-3 items-center justify-between md:flex">
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <GraduationCap size={11} />
              <span>ClassPulse — Plateforme académique EdTech</span>
            </div>
            <span className="text-[11px] text-muted-foreground">© {new Date().getFullYear()}</span>
          </footer>
        </div>

        {/* Assistant IA flottant */}
        <AssistantFab />
      </div>
    </SidebarProvider>
  );
}
