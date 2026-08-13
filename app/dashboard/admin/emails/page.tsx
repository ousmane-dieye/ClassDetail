import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getEmailDashboardData, type EmailNotificationType, type EmailNotificationStatus } from "@/lib/email/notifications";
import { EmailTestForm } from "@/components/EmailTestForm";

const TYPE_LABELS: Record<EmailNotificationType, string> = {
  AUTHENTICATION_APPROVED: "Accès accepté",
  ASSIGNMENT_3_DAYS: "Rappel J-3",
  ASSIGNMENT_1_DAY: "Rappel J-1",
};

const PROVIDER_LABELS: Record<string, string> = {
  smtp: "SMTP",
  resend: "Resend",
  none: "Non configuré",
};

function StatusBadge({ status }: { status: EmailNotificationStatus }) {
  const base = "rounded px-2 py-0.5 text-xs font-medium";
  if (status === "SENT") return <span className={`${base} bg-success/10 text-success`}>SENT</span>;
  if (status === "FAILED") return <span className={`${base} bg-danger/10 text-danger`}>FAILED</span>;
  return <span className={`${base} bg-warning/10 text-warning`}>PENDING</span>;
}

export default async function AdminEmailsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "ADMIN") redirect("/dashboard");

  const data = await getEmailDashboardData();

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Emails &amp; Notifications</h1>

      <section className="rounded-lg border border-border p-4">
        <h2 className="mb-3 text-lg font-semibold">Configuration</h2>
        <div className="grid gap-2 text-sm sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">Expéditeur (FROM)</p>
            <p className="font-medium">{data.from}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Nom de l&apos;expéditeur</p>
            <p className="font-medium">{data.fromName}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Provider actif</p>
            <p className="font-medium">{PROVIDER_LABELS[data.provider] ?? data.provider}</p>
          </div>
        </div>
      </section>

      <section>
        <div className="mb-3 grid grid-cols-2 gap-4 md:grid-cols-4">
          <div className="rounded-lg border border-border p-4">
            <p className="text-2xl font-bold">{data.counts.total}</p>
            <p className="text-xs text-muted-foreground">Total</p>
          </div>
          <div className="rounded-lg border border-border p-4">
            <p className="text-2xl font-bold text-success">{data.counts.sent}</p>
            <p className="text-xs text-muted-foreground">Envoyés</p>
          </div>
          <div className="rounded-lg border border-border p-4">
            <p className="text-2xl font-bold text-danger">{data.counts.failed}</p>
            <p className="text-xs text-muted-foreground">Échecs</p>
          </div>
          <div className="rounded-lg border border-border p-4">
            <p className="text-2xl font-bold text-warning">{data.counts.pending}</p>
            <p className="text-xs text-muted-foreground">En attente</p>
          </div>
        </div>
      </section>

      <EmailTestForm />

      <section>
        <h2 className="mb-3 text-lg font-semibold">Derniers emails</h2>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-muted text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Destinataire</th>
                <th className="px-4 py-2">Utilisateur</th>
                <th className="px-4 py-2">Devoir</th>
                <th className="px-4 py-2">Type</th>
                <th className="px-4 py-2">Statut</th>
                <th className="px-4 py-2">Date</th>
              </tr>
            </thead>
            <tbody>
              {data.recent.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                    Aucun email envoyé pour le moment.
                  </td>
                </tr>
              )}
              {data.recent.map((row) => (
                <tr key={row.id} className="border-t border-border">
                  <td className="px-4 py-2">{row.email}</td>
                  <td className="px-4 py-2">{row.student_name}</td>
                  <td className="px-4 py-2">{row.assignment_title ?? "—"}</td>
                  <td className="px-4 py-2">{TYPE_LABELS[row.notification_type] ?? row.notification_type}</td>
                  <td className="px-4 py-2">
                    <StatusBadge status={row.status} />
                    {row.status === "FAILED" && row.error_message && (
                      <span className="block max-w-[220px] truncate text-xs text-muted-foreground" title={row.error_message}>
                        {row.error_message}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">
                    {row.created_at ? new Date(row.created_at).toLocaleString("fr-FR") : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
