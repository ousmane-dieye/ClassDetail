import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { shouldHardDelete } from "@/lib/business/taskStatus";

export const dynamic = "force-dynamic";

/**
 * Route Handler cron : marque les tâches expirées (status visuel EXPIRED)
 * et supprime définitivement celles expirées depuis plus de 24h.
 * Idempotent : peut être appelé plusieurs fois sans effet de bord.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const now = new Date();

  const { data: tasks, error } = await supabase.from("tasks").select("id, due_date, is_expired");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let markedExpired = 0;
  let deleted = 0;

  for (const task of tasks ?? []) {
    const due = new Date(task.due_date);

    if (shouldHardDelete(due, now)) {
      const { error: delError } = await supabase.from("tasks").delete().eq("id", task.id);
      if (!delError) deleted++;
      continue;
    }

    if (due.getTime() < now.getTime() && !task.is_expired) {
      const { error: updError } = await supabase
        .from("tasks")
        .update({ is_expired: true })
        .eq("id", task.id);
      if (!updError) markedExpired++;
    }
  }

  return NextResponse.json({ ok: true, markedExpired, deleted });
}
