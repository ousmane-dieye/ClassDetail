import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { canViewClassStats } from "@/lib/business/permissions";
import { PageHeader } from "@/components/PageHeader";
import { BarChart3, Users, CheckSquare, FileText, Lightbulb, Video, Award, Percent } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent } from "@/components/ui/Card";

interface ClassAggregate {
  className: string;
  students: number;
  tasks: number;
  completions: number;
  completionRate: number;
}

export default async function StatsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("profiles").select("class_id, role").eq("id", user!.id).single();

  const classId = profile?.class_id ?? "";
  if (!profile || !canViewClassStats({ id: user!.id, role: profile.role, classId: profile.class_id }, classId)) {
    redirect("/dashboard");
  }

  const isAdmin = profile.role === "ADMIN";
  const scope = isAdmin ? {} : { class_id: classId };

  const [
    { count: studentCount },
    { count: delegateCount },
    { count: taskCount },
    { count: docCount },
    { count: hintCount },
    { count: recordingCount },
    { data: completions },
  ] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "STUDENT").match(scope),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "DELEGATE").match(scope),
    supabase.from("tasks").select("id", { count: "exact", head: true }).match(scope),
    supabase.from("documents").select("id", { count: "exact", head: true }).match(scope),
    supabase.from("hints").select("id", { count: "exact", head: true }).match(scope),
    supabase.from("recordings").select("id", { count: "exact", head: true }).match(scope),
    isAdmin
      ? supabase.from("task_completions").select("task_id")
      : supabase.from("task_completions").select("task_id, tasks!inner(class_id)").eq("tasks.class_id", classId),
  ]);

  const completedCount = completions?.length ?? 0;
  const maxPossible = (taskCount ?? 0) * (studentCount ?? 0);
  const completionRate = maxPossible > 0 ? Math.round((completedCount / maxPossible) * 100) : 0;

  let perClass: ClassAggregate[] = [];
  if (isAdmin) {
    const { data: classes } = await supabase.from("classes").select("id, name").order("name");
    perClass = await Promise.all(
      (classes ?? []).map(async (c) => {
        const [{ count: students }, { count: tasks }, { data: completions }] = await Promise.all([
          supabase.from("profiles").select("id", { count: "exact", head: true }).eq("class_id", c.id).eq("role", "STUDENT"),
          supabase.from("tasks").select("id", { count: "exact", head: true }).eq("class_id", c.id),
          supabase.from("task_completions").select("task_id, tasks!inner(class_id)").eq("tasks.class_id", c.id),
        ]);
        const max = (tasks ?? 0) * (students ?? 0);
        return {
          className: c.name,
          students: students ?? 0,
          tasks: tasks ?? 0,
          completions: completions?.length ?? 0,
          completionRate: max > 0 ? Math.round(((completions?.length ?? 0) / max) * 100) : 0,
        };
      })
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <PageHeader
        icon={BarChart3}
        title={isAdmin ? "Statistiques globales" : "Statistiques de votre classe"}
        description="Mesurez l'engagement, le taux de complétion des devoirs et les ressources partagées."
      />

      {/* Grid Carte Statistiques */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard icon={Users} label="Étudiants" value={studentCount ?? 0} color="primary" />
        <StatCard icon={Award} label="Délégués" value={delegateCount ?? 0} color="warning" />
        <StatCard icon={CheckSquare} label="Tâches créées" value={taskCount ?? 0} color="success" />
        <StatCard icon={FileText} label="Documents" value={docCount ?? 0} color="info" />
        <StatCard icon={Lightbulb} label="Hints &amp; Annales" value={hintCount ?? 0} color="warning" />
        <StatCard icon={Video} label="Cours enregistrés" value={recordingCount ?? 0} color="info" />
        <StatCard icon={CheckSquare} label="Complétions" value={completedCount} color="success" />
        <StatCard icon={Percent} label="Taux de complétion" value={completionRate} suffix="%" color="primary" />
      </div>

      {/* Table par classe pour les admins */}
      {isAdmin && perClass.length > 0 && (
        <section className="space-y-4 pt-4">
          <h2 className="text-xl font-bold tracking-tight text-foreground">Statistiques détaillées par classe</h2>
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border bg-muted/50 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-6 py-3.5">Nom de la classe</th>
                    <th className="px-6 py-3.5">Étudiants</th>
                    <th className="px-6 py-3.5">Tâches</th>
                    <th className="px-6 py-3.5">Complétions</th>
                    <th className="px-6 py-3.5">Taux de réussite</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {perClass.map((c) => (
                    <tr key={c.className} className="transition-colors hover:bg-muted/30">
                      <td className="px-6 py-4 font-bold text-foreground">{c.className}</td>
                      <td className="px-6 py-4 text-muted-foreground">{c.students}</td>
                      <td className="px-6 py-4 text-muted-foreground">{c.tasks}</td>
                      <td className="px-6 py-4 text-muted-foreground">{c.completions}</td>
                      <td className="px-6 py-4">
                        <Badge variant={c.completionRate > 50 ? "success" : "warning"}>
                          {c.completionRate}%
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </section>
      )}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  suffix = "",
  color = "primary",
}: {
  icon: any;
  label: string;
  value: number;
  suffix?: string;
  color?: "primary" | "success" | "warning" | "info";
}) {
  const colorClasses = {
    primary: "bg-primary/10 text-primary border-primary/20",
    success: "bg-success/10 text-success border-success/20",
    warning: "bg-warning/10 text-warning border-warning/20",
    info: "bg-info/10 text-info border-info/20",
  };

  return (
    <Card className="p-4 sm:p-5 flex flex-col justify-between space-y-3">
      <div className="flex items-center justify-between">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl border ${colorClasses[color]}`}>
          <Icon size={20} />
        </div>
      </div>
      <div>
        <p className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
          {value}{suffix}
        </p>
        <p className="text-xs font-medium text-muted-foreground mt-0.5">{label}</p>
      </div>
    </Card>
  );
}
