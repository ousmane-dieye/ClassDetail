import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decideRegistrationAction } from "@/actions/auth";
import { Users, CheckSquare, Clock, Check, X, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";

export default async function DelegateDashboard() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("class_id, role").eq("id", user.id).single();

  if (!profile || (profile.role !== "DELEGATE" && profile.role !== "ADMIN")) redirect("/dashboard");

  const classId = profile?.class_id ?? "";

  const admin = createAdminClient();
  const { data: pendingRequests } = await admin
    .from("registration_requests")
    .select("id, created_at, profiles!registration_requests_user_id_fkey(first_name, last_name, email)")
    .eq("class_id", classId)
    .eq("status", "PENDING");

  const { count: taskCount } = await supabase
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("class_id", classId);

  const { count: studentCount } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("class_id", classId);

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div>
        <div className="inline-flex items-center gap-2 rounded-full border border-warning/30 bg-warning/10 px-3 py-1 text-xs font-semibold text-warning">
          <ShieldAlert size={14} />
          <span>Espace de Gestion Délégué</span>
        </div>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Tableau de bord délégué
        </h1>
        <p className="text-sm text-muted-foreground">
          Gérez la classe, validez les nouveaux étudiants et publiez des devoirs.
        </p>
      </div>

      {/* Quick Stats Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard icon={Users} label="Étudiants inscrits" value={studentCount ?? 0} color="primary" />
        <StatCard icon={CheckSquare} label="Tâches actives" value={taskCount ?? 0} color="success" />
        <StatCard icon={Clock} label="Demandes en attente" value={(pendingRequests ?? []).length} color="warning" />
      </div>

      {/* Pending Registration Requests Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold tracking-tight text-foreground">
            Demandes d'inscription en attente
          </h2>
          <Badge variant="outline">{(pendingRequests ?? []).length} demande(s)</Badge>
        </div>

        <div className="space-y-3">
          {(pendingRequests ?? []).length === 0 ? (
            <EmptyState
              title="Aucune demande en attente"
              description="Tous les étudiants de votre classe ont été validés."
            />
          ) : (
            (pendingRequests ?? []).map((r: any) => (
              <Card key={r.id}>
                <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <p className="font-semibold text-foreground">
                      {r.profiles?.first_name} {r.profiles?.last_name}
                    </p>
                    <p className="text-xs text-muted-foreground">{r.profiles?.email}</p>
                    <p className="text-[11px] text-muted-foreground">
                      Demandé le {new Date(r.created_at).toLocaleDateString("fr-FR")}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <form action={async () => { "use server"; await decideRegistrationAction(r.id, "ACCEPTED"); }}>
                      <Button size="sm" variant="success" className="gap-1">
                        <Check size={14} />
                        <span>Accepter</span>
                      </Button>
                    </form>
                    <form action={async () => { "use server"; await decideRegistrationAction(r.id, "REJECTED"); }}>
                      <Button size="sm" variant="danger" className="gap-1">
                        <X size={14} />
                        <span>Refuser</span>
                      </Button>
                    </form>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
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
  color: "primary" | "success" | "warning";
}) {
  const colorMap = {
    primary: "bg-primary/10 text-primary border-primary/20",
    success: "bg-success/10 text-success border-success/20",
    warning: "bg-warning/10 text-warning border-warning/20",
  };

  return (
    <Card className="p-5 flex items-center gap-4">
      <div className={`flex h-12 w-12 items-center justify-center rounded-2xl border ${colorMap[color]}`}>
        <Icon size={24} />
      </div>
      <div>
        <p className="text-2xl font-extrabold tracking-tight text-foreground">{value}</p>
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
      </div>
    </Card>
  );
}
