import { createClient } from "@/lib/supabase/server";
import { TaskCard } from "@/components/TaskCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { Card, CardContent } from "@/components/ui/Card";
import { CS_IMAGES } from "@/lib/constants/images";
import { INSPIRATIONAL_QUOTES } from "@/lib/constants/quotes";
import {
  CheckSquare,
  FileText,
  Clock,
  ArrowRight,
  BookOpen,
  Flame,
  CalendarDays,
  Sparkles,
} from "lucide-react";
import Link from "next/link";

export default async function StudentDashboard() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name, last_name, class_id")
    .eq("id", user!.id)
    .single();

  const { data: tasks } = await supabase
    .from("tasks")
    .select("*")
    .eq("class_id", profile?.class_id ?? "")
    .eq("is_expired", false)
    .order("due_date", { ascending: true })
    .limit(6);

  const { data: completions } = await supabase
    .from("task_completions")
    .select("task_id")
    .eq("student_id", user!.id);
  const completedIds = new Set((completions ?? []).map((c) => c.task_id));

  const { data: recentDocs } = await supabase
    .from("documents")
    .select("id, title, drive_url, created_at")
    .eq("class_id", profile?.class_id ?? "")
    .order("created_at", { ascending: false })
    .limit(5);

  const allTasks = tasks ?? [];
  const pendingTasks = allTasks.filter((t) => !completedIds.has(t.id));
  const completedTasks = allTasks.filter((t) => completedIds.has(t.id));
  const completionRate =
    allTasks.length > 0 ? Math.round((completedTasks.length / allTasks.length) * 100) : 0;

  const urgentTasks = pendingTasks.filter((t) => {
    const diffHours = (new Date(t.due_date).getTime() - Date.now()) / (1000 * 60 * 60);
    return diffHours <= 48 && diffHours > 0;
  });

  const weekTasks = pendingTasks.filter((t) => {
    const diffDays = (new Date(t.due_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    return diffDays <= 7 && diffDays > 0;
  });

  const quote = INSPIRATIONAL_QUOTES[Math.floor(Math.random() * INSPIRATIONAL_QUOTES.length)]!;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Bonjour" : hour < 18 ? "Bon après-midi" : "Bonsoir";
  const today = new Date().toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div className="space-y-8 animate-fade-in">
      {/* ── Hero ── */}
      <section className="grid gap-6 lg:grid-cols-12">
        <div className="flex flex-col justify-between gap-6 lg:col-span-8">
          <div className="space-y-4">
            <p className="text-sm font-medium capitalize text-muted-foreground">{today}</p>
            <h1 className="font-display text-3xl font-bold leading-tight tracking-tight text-foreground sm:text-4xl">
              {greeting},{" "}
              <span className="text-primary">{profile?.first_name ?? "Étudiant"}</span>
            </h1>
            <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
              Voici ce qui vous attend aujourd&apos;hui.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <span className="inline-flex items-center gap-2 rounded-full border border-danger/25 bg-danger/8 px-3 py-1.5 text-xs font-bold text-danger">
              <Flame size={13} />
              {urgentTasks.length} urgent{urgentTasks.length > 1 ? "s" : ""} dans les 48h
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground shadow-subtle">
              <CalendarDays size={13} className="text-primary" />
              {weekTasks.length} devoir{weekTasks.length > 1 ? "s" : ""} cette semaine
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground shadow-subtle">
              <Sparkles size={13} className="text-warning" />
              {(recentDocs ?? []).length} nouvelle{(recentDocs ?? []).length > 1 ? "s" : ""} ressource{(recentDocs ?? []).length > 1 ? "s" : ""}
            </span>
          </div>
        </div>

        {/* Résumé d'aujourd'hui */}
        <Card className="flex flex-col justify-between gap-5 p-6 lg:col-span-4" hoverEffect={false}>
          <div className="flex items-center justify-between">
            <h2 className="font-display text-sm font-bold uppercase tracking-[0.12em] text-muted-foreground">
              Vue d&apos;aujourd&apos;hui
            </h2>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <CheckSquare size={15} />
            </span>
          </div>

          <div className="flex items-center gap-5">
            <div className="relative flex h-20 w-20 shrink-0 items-center justify-center">
              <svg className="h-20 w-20 -rotate-90" viewBox="0 0 100 100" aria-hidden="true">
                <circle cx="50" cy="50" r="40" fill="none" stroke="hsl(var(--muted))" strokeWidth="8" />
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  fill="none"
                  stroke="hsl(var(--primary))"
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={`${completionRate * 2.51} 251`}
                  className="transition-all duration-700"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="font-display text-lg font-bold text-foreground">{completionRate}%</span>
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-bold text-foreground">
                {pendingTasks.length} à faire
              </p>
              <p className="text-xs text-muted-foreground">
                {completedTasks.length} de {allTasks.length} terminées
              </p>
            </div>
          </div>

          <Link
            href="/dashboard/tasks"
            className="group inline-flex items-center gap-1.5 text-sm font-semibold text-primary transition-colors hover:text-primary/80"
          >
            Consulter mes tâches
            <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
          </Link>
        </Card>
      </section>

      {/* ── Alerte urgente ── */}
      {urgentTasks.length > 0 && (
        <div className="flex items-center gap-3 rounded-2xl border border-danger/30 bg-danger/6 px-4 py-3.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-danger/12 text-danger">
            <Flame size={17} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-danger">
              {urgentTasks.length} devoir{urgentTasks.length > 1 ? "s" : ""} dans les prochaines 48h
            </p>
            <p className="truncate text-xs text-danger/70">
              {urgentTasks.map((t) => t.title).join(" · ")}
            </p>
          </div>
          <Link
            href="/dashboard/tasks"
            className="shrink-0 rounded-xl border border-danger/30 bg-danger/10 px-3 py-1.5 text-xs font-bold text-danger transition-all hover:bg-danger/20"
          >
            Voir tout
          </Link>
        </div>
      )}

      {/* ── Grille principale ── */}
      <div className="grid gap-8 lg:grid-cols-12">
        {/* À faire prochainement */}
        <section className="space-y-4 lg:col-span-7">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Clock size={15} />
              </div>
              <h2 className="font-display text-lg font-bold tracking-tight text-foreground">
                À faire prochainement
              </h2>
            </div>
            <Link
              href="/dashboard/tasks"
              className="group inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold text-primary transition-all hover:bg-primary/8"
            >
              <span>Voir tout</span>
              <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>

          <div className="space-y-3">
            {allTasks.length === 0 ? (
              <EmptyState
                imageUrl={CS_IMAGES.emptyTasks}
                title="Tout est à jour"
                description="Aucun devoir ou exercice à venir. Profitez-en pour réviser ou aider un camarade."
              />
            ) : (
              allTasks.map((t) => (
                <TaskCard key={t.id} task={t} completed={completedIds.has(t.id)} />
              ))
            )}
          </div>
        </section>

        {/* Dernières ressources + découverte */}
        <section className="space-y-6 lg:col-span-5">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-success/10 text-success">
                  <FileText size={15} />
                </div>
                <h2 className="font-display text-lg font-bold tracking-tight text-foreground">
                  Dernières ressources
                </h2>
              </div>
              <Link
                href="/dashboard/documents"
                className="group inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold text-primary transition-all hover:bg-primary/8"
              >
                <span>Bibliothèque</span>
                <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>

            <div className="space-y-2.5">
              {(recentDocs ?? []).length === 0 ? (
                <EmptyState
                  imageUrl={CS_IMAGES.emptyDocs}
                  title="Aucun document"
                  description="Les premiers supports de cours apparaîtront ici."
                />
              ) : (
                (recentDocs ?? []).map((d) => (
                  <Card key={d.id} className="group transition-all hover:border-primary/25 hover:shadow-lift">
                    <CardContent className="flex items-center justify-between p-3.5">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/8 text-primary">
                          <FileText size={18} strokeWidth={1.75} />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-foreground">{d.title}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {new Date(d.created_at).toLocaleDateString("fr-FR", {
                              day: "numeric",
                              month: "short",
                            })}
                          </p>
                        </div>
                      </div>
                      <a
                        href={d.drive_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-2 inline-flex shrink-0 items-center gap-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-bold text-primary transition-all hover:border-primary/30 hover:bg-primary/8"
                      >
                        Ouvrir
                        <ArrowRight size={11} />
                      </a>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </div>

          {/* Découverte */}
          <div className="space-y-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-info/10 text-info">
                <BookOpen size={15} />
              </div>
              <h2 className="font-display text-lg font-bold tracking-tight text-foreground">À explorer</h2>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <Link
                href="/dashboard/hints"
                className="group flex flex-col items-start gap-3 rounded-2xl border border-border bg-card p-4 shadow-subtle transition-all hover:border-info/40 hover:shadow-lift"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-info/10 text-info transition-transform group-hover:scale-105">
                  <BookOpen size={18} strokeWidth={1.75} />
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground">Hints & Annales</p>
                  <p className="text-xs text-muted-foreground">Sujets d&apos;examens passés</p>
                </div>
              </Link>
              <Link
                href="/dashboard/recordings"
                className="group flex flex-col items-start gap-3 rounded-2xl border border-border bg-card p-4 shadow-subtle transition-all hover:border-warning/40 hover:shadow-lift"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-warning/12 text-warning transition-transform group-hover:scale-105">
                  <BookOpen size={18} strokeWidth={1.75} />
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground">Cours enregistrés</p>
                  <p className="text-xs text-muted-foreground">Réviser à votre rythme</p>
                </div>
              </Link>
            </div>
          </div>

          {/* Citation discrète */}
          <div className="rounded-2xl border border-border bg-card/60 p-4">
            <p className="text-sm italic leading-relaxed text-foreground">&ldquo;{quote.quote}&rdquo;</p>
            <p className="mt-1 text-xs font-semibold text-muted-foreground">— {quote.author}</p>
          </div>
        </section>
      </div>
    </div>
  );
}
