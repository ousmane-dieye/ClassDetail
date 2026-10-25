import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  createClassAction,
  deleteClassAction,
  createSubjectAction,
  appointDelegateAction,
  removeDelegateAction,
} from "@/actions/classes";
import { decideRegistrationAction } from "@/actions/auth";
import Link from "next/link";
import {
  Shield,
  BookOpen,
  Users,
  CheckSquare,
  Mail,
  Plus,
  UserCheck,
  UserX,
  Check,
  X,
  TrendingUp,
  GraduationCap,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDeleteButton } from "@/components/ConfirmDeleteButton";

export default async function AdminDashboard() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();

  if (!me || me.role !== "ADMIN") redirect("/dashboard");

  const admin = createAdminClient();

  // 6 requêtes indépendantes → parallélisées
  const [
    classesResult,
    totalStudentsResult,
    totalDelegatesResult,
    totalTasksResult,
    pendingRequestsResult,
    membersResult,
  ] = await Promise.all([
    supabase.from("classes").select("id, name, level, academic_year").order("name"),
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "STUDENT"),
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "DELEGATE"),
    supabase.from("tasks").select("id", { count: "exact", head: true }),
    admin
      .from("registration_requests")
      .select(
        "id, created_at, previous_class_id, profiles!registration_requests_user_id_fkey(first_name, last_name, email), " +
          "classes!registration_requests_class_id_fkey(name), " +
          "previous_class:classes!registration_requests_previous_class_id_fkey(name)"
      )
      .eq("status", "PENDING")
      .order("created_at", { ascending: true }),
    admin
      .from("profiles")
      .select("id, first_name, last_name, email, role, class_id")
      .in("role", ["STUDENT", "DELEGATE"]),
  ]);

  const classes = classesResult.data;
  const totalStudents = totalStudentsResult.count;
  const totalDelegates = totalDelegatesResult.count;
  const totalTasks = totalTasksResult.count;
  const pendingRequests = pendingRequestsResult.data;
  const members = membersResult.data;

  // ── DIAGNOSTIC : log toutes les erreurs serveur ──
  const diagErrors: { label: string; error: any }[] = [
    { label: "classes", error: classesResult.error },
    { label: "totalStudents", error: totalStudentsResult.error },
    { label: "totalDelegates", error: totalDelegatesResult.error },
    { label: "totalTasks", error: totalTasksResult.error },
    { label: "pendingRequests", error: pendingRequestsResult.error },
    { label: "members", error: membersResult.error },
  ].filter((e) => !!e.error);
  if (diagErrors.length > 0) {
    console.error("[AdminDashboard] Erreurs Supabase:", JSON.stringify(diagErrors, null, 2));
  }

  const membersList = (members ?? []) as any[];
  const memberGroups: { title: string; classId: string; members: any[] }[] = (classes ?? [])
    .map((c) => ({
      title: `${c.name} — ${c.level} (${c.academic_year})`,
      classId: c.id,
      members: membersList.filter((m) => m.class_id === c.id),
    }))
    .filter((g) => g.members.length > 0);
  const orphans = membersList.filter((m) => !m.class_id);
  if (orphans.length > 0)
    memberGroups.push({ title: "Sans classe", classId: "", members: orphans });

  const pendingCount = (pendingRequests ?? []).length;

  return (
    <div className="space-y-10 animate-fade-in">
      {/* ── DIAGNOSTIC PANEL (visible seulement si erreurs) ── */}
      {diagErrors.length > 0 && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 space-y-2">
          <p className="text-sm font-bold text-red-400 flex items-center gap-2">
            🔴 Erreurs Supabase détectées ({diagErrors.length})
          </p>
          {diagErrors.map((e) => (
            <div key={e.label} className="rounded-lg bg-red-950/60 p-3 text-xs font-mono">
              <p className="text-red-300 font-bold mb-1">[{e.label}]</p>
              <p className="text-red-200">
                <strong>code:</strong> {e.error?.code ?? "—"}
              </p>
              <p className="text-red-200">
                <strong>message:</strong> {e.error?.message ?? "—"}
              </p>
              <p className="text-red-200">
                <strong>details:</strong> {e.error?.details ?? "—"}
              </p>
              <p className="text-red-200">
                <strong>hint:</strong> {e.error?.hint ?? "—"}
              </p>
            </div>
          ))}
          <p className="text-[11px] text-red-400/70">
            💡 Retire ce bloc une fois le problème résolu.
          </p>
        </div>
      )}

      {/* ── Header ── */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-danger/30 bg-danger/8 px-3 py-1.5 text-xs font-bold text-danger">
            <Shield size={13} strokeWidth={2} />
            <span>Panneau d&apos;Administration Générale</span>
          </div>
          <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
            Administration
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Gérez les classes, les étudiants, les délégués et les inscriptions.
          </p>
        </div>

        <Link href="/dashboard/admin/emails">
          <Button variant="outline" className="gap-2 shrink-0">
            <Mail size={15} />
            <span>Emails & Notifications</span>
          </Button>
        </Link>
      </div>

      {/* ── Stats Grid ── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard icon={GraduationCap} label="Classes" value={(classes ?? []).length} color="primary" />
        <StatCard icon={Users} label="Étudiants" value={totalStudents ?? 0} color="info" />
        <StatCard icon={UserCheck} label="Délégués" value={totalDelegates ?? 0} color="warning" />
        <StatCard icon={CheckSquare} label="Tâches actives" value={totalTasks ?? 0} color="success" />
      </div>

      {/* ── Pending Requests ── */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-warning/10">
              <Clock size={16} className="text-warning" />
            </div>
            <h2 className="text-xl font-bold tracking-tight text-foreground">
              Demandes d&apos;inscription en attente
            </h2>
          </div>
          {pendingCount > 0 && (
            <Badge variant="warning">{pendingCount} en attente</Badge>
          )}
        </div>

        <div className="space-y-3">
          {pendingCount === 0 ? (
            <EmptyState
              title="Aucune demande"
              description="Toutes les demandes d'inscription ont été traitées."
            />
          ) : (
            (pendingRequests ?? []).map((r: any) => (
              <Card key={r.id} className="border-warning/20 hover:border-warning/40 transition-all">
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-warning/10 text-warning font-bold text-sm">
                      {r.profiles?.first_name?.[0] ?? "?"}
                    </div>
                    <div>
                      <p className="font-bold text-foreground">
                        {r.profiles?.first_name} {r.profiles?.last_name}
                      </p>
                      <p className="text-xs text-muted-foreground">{r.profiles?.email}</p>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        <Badge variant="outline" className="text-[10px]">
                          Classe demandée : {r.classes?.name}
                        </Badge>
                        {r.previous_class_id ? (
                          <Badge variant="info" className="text-[10px]">
                            Changement depuis {r.previous_class?.name ?? "une autre classe"}
                          </Badge>
                        ) : (
                          <Badge variant="neutral" className="text-[10px]">
                            Nouvelle inscription
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 sm:shrink-0">
                    <form action={async () => { "use server"; await decideRegistrationAction(r.id, "ACCEPTED"); }}>
                      <Button size="sm" variant="success" className="gap-1.5">
                        <Check size={13} />
                        <span>Accepter</span>
                      </Button>
                    </form>
                    <form action={async () => { "use server"; await decideRegistrationAction(r.id, "REJECTED"); }}>
                      <Button size="sm" variant="danger" className="gap-1.5">
                        <X size={13} />
                        <span>Refuser</span>
                      </Button>
                    </form>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </section>

      {/* ── Delegate Management ── */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10">
            <UserCheck size={16} className="text-primary" />
          </div>
          <h2 className="text-xl font-bold tracking-tight text-foreground">
            Gestion des Délégués par Classe
          </h2>
        </div>

        {memberGroups.length === 0 ? (
          <EmptyState title="Aucun membre" description="Aucun étudiant inscrit pour le moment." />
        ) : (
          <div className="space-y-4">
            {memberGroups.map((group) => (
              <Card key={group.title}>
                <CardHeader className="pb-3 pt-4 px-5">
                  <div className="flex items-center gap-2">
                    <BookOpen size={14} className="text-muted-foreground" />
                    <CardTitle className="text-sm font-bold text-muted-foreground uppercase tracking-wider">
                      {group.title}
                    </CardTitle>
                    <Badge variant="outline" className="ml-auto text-[10px]">
                      {group.members.length} membre(s)
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="px-5 pb-4 space-y-2">
                  {group.members.map((m: any) => (
                    <div
                      key={m.id}
                      className="flex flex-col gap-2 rounded-xl border border-border/70 bg-background/50 p-3 sm:flex-row sm:items-center sm:justify-between transition-colors hover:bg-muted/40"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary text-xs font-bold">
                          {m.first_name?.[0] ?? "?"}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">
                            {m.first_name} {m.last_name}
                          </p>
                          <p className="text-[11px] text-muted-foreground truncate">{m.email}</p>
                        </div>
                        {m.role === "DELEGATE" && (
                          <Badge variant="warning" className="shrink-0">★ Délégué</Badge>
                        )}
                      </div>

                      {m.role === "DELEGATE" ? (
                        <form action={async () => { "use server"; await removeDelegateAction(m.id); }}>
                          <Button size="sm" variant="danger" className="gap-1.5 shrink-0">
                            <UserX size={13} />
                            <span>Révoquer</span>
                          </Button>
                        </form>
                      ) : (
                        <form action={async () => { "use server"; await appointDelegateAction(m.id); }}>
                          <Button size="sm" variant="default" className="gap-1.5 shrink-0">
                            <UserCheck size={13} />
                            <span>Promouvoir</span>
                          </Button>
                        </form>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* ── Classes & Subjects Management ── */}
      <div className="grid gap-8 lg:grid-cols-2">
        {/* Classes */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-success/10">
              <GraduationCap size={16} className="text-success" />
            </div>
            <h2 className="text-xl font-bold tracking-tight text-foreground">Classes</h2>
          </div>

          <Card>
            <CardHeader className="p-5 pb-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <Plus size={15} className="text-primary" />
                Créer une classe
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-5 space-y-3">
              <form
                action={async (fd) => { "use server"; await createClassAction(fd); }}
                className="space-y-3"
              >
                <Input name="name" placeholder="Nom (ex: GL2-A)" required />
                <Input name="level" placeholder="Niveau (ex: Licence 2)" required />
                <Input name="academicYear" placeholder="Année (ex: 2026-2027)" required />
                <Button type="submit" className="w-full gap-1.5">
                  <Plus size={15} />
                  <span>Créer la classe</span>
                </Button>
              </form>

              {(classes ?? []).length > 0 && (
                <div className="mt-4 space-y-2 border-t border-border/70 pt-4">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
                    Classes existantes ({(classes ?? []).length})
                  </p>
                  {(classes ?? []).map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between rounded-xl border border-border bg-background/50 p-3 text-sm transition-colors hover:bg-muted/40"
                    >
                      <div>
                        <span className="font-semibold text-foreground">{c.name}</span>
                        <span className="ml-1.5 text-xs text-muted-foreground">— {c.level} ({c.academic_year})</span>
                      </div>
                      <ConfirmDeleteButton
                        action={deleteClassAction}
                        resourceId={c.id}
                        resourceName={c.name}
                        resourceLabel="cette classe"
                        buttonTitle="Supprimer la classe"
                        className="h-7 w-7"
                        iconSize={13}
                      />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        {/* Subjects */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-info/10">
              <BookOpen size={16} className="text-info" />
            </div>
            <h2 className="text-xl font-bold tracking-tight text-foreground">Matières</h2>
          </div>

          <Card>
            <CardHeader className="p-5 pb-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <Plus size={15} className="text-primary" />
                Ajouter une matière
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-5 space-y-3">
              <form
                action={async (fd) => { "use server"; await createSubjectAction(fd); }}
                className="space-y-3"
              >
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Classe concernée</label>
                  <Select name="classId" required defaultValue="">
                    <option value="">Sélectionner une classe</option>
                    {(classes ?? []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} — {c.level}
                      </option>
                    ))}
                  </Select>

                </div>
                <Input
                  name="name"
                  placeholder="Nom de la matière (ex: Algorithmique)"
                  required
                />
                <Input name="code" placeholder="Code optionnel (ex: CS201)" />
                <Button type="submit" className="w-full gap-1.5">
                  <Plus size={15} />
                  <span>Ajouter la matière</span>
                </Button>
              </form>
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: any;
  label: string;
  value: number;
  color: "primary" | "success" | "warning" | "info" | "danger";
}) {
  const colorMap = {
    primary: { bg: "bg-primary/10", text: "text-primary" },
    success: { bg: "bg-success/10", text: "text-success" },
    warning: { bg: "bg-warning/10", text: "text-warning" },
    info: { bg: "bg-info/10", text: "text-info" },
    danger: { bg: "bg-danger/10", text: "text-danger" },
  };
  const { bg, text } = colorMap[color];

  return (
    <Card className="flex flex-col gap-3 p-4 transition-all hover:shadow-lift hover:-translate-y-0.5">
      <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${bg} ${text}`}>
        <Icon size={20} strokeWidth={1.75} />
      </div>
      <div>
        <p className="text-2xl font-extrabold text-foreground">{value}</p>
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
      </div>
    </Card>
  );
}
