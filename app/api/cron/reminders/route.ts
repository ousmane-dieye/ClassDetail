import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendAssignmentReminderEmailToUser } from "@/lib/email/notifications";
import { getReminderKind } from "@/lib/email/reminders";

export const dynamic = "force-dynamic";

/**
 * Route Handler déclenchée par Vercel Cron (voir vercel.json), 1x/jour.
 *
 * Pour chaque devoir non expiré à J-3 ou J-1 (dans le fuseau de l'app) :
 *   - notification interne (table `notifications`, anti-doublon via
 *     `task_reminders_sent`) pour les étudiants de la classe qui n'ont pas rendu ;
 *   - email automatique depuis l'email administrateur (anti-doublon via
 *     `assignment_email_notifications`) — jamais renvoyé si déjà SENT,
 *     jamais envoyé si le devoir a déjà été rendu, retenté si échec (FAILED).
 *
 * Gère : fuseau horaire (NEXT_PUBLIC_APP_TIMEZONE), changement de deadline
 * (recalcul de J chaque jour), devoir supprimé (cascade) et devoir rendu.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const now = new Date();

  const { data: tasks, error } = await supabase
    .from("tasks")
    .select("id, title, due_date, class_id, subject_id, subjects(name)")
    .eq("is_expired", false);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const stats = {
    tasksProcessed: 0,
    notificationsCreated: 0,
    emailsSent: 0,
    emailsSkipped: 0,
    emailsFailed: 0,
    errors: [] as string[],
  };

  for (const raw of tasks ?? []) {
    const task = raw as any;
    const due = new Date(task.due_date);
    const kind = getReminderKind(due, now);
    if (!kind) continue;

    stats.tasksProcessed++;

    // Étudiants de la classe + ceux qui ont déjà rendu ce devoir.
    const { data: members } = await supabase
      .from("profiles")
      .select("id, email, first_name")
      .eq("class_id", task.class_id);

    const { data: completions } = await supabase
      .from("task_completions")
      .select("student_id")
      .eq("task_id", task.id);

    const completedIds = new Set((completions ?? []).map((c) => c.student_id));
    const pendingStudents = (members ?? []).filter((m) => !completedIds.has(m.id));

    const subjectName = task.subjects?.name ?? "";

    for (const student of pendingStudents) {
      // ---- Notification interne (comportement existant, inchangé) ----
      const { error: insertError } = await supabase.from("task_reminders_sent").insert({
        task_id: task.id,
        student_id: student.id,
        kind,
      });
      if (!insertError) {
        stats.notificationsCreated++;
        await supabase.from("notifications").insert({
          recipient_id: student.id,
          type: "TASK_REMINDER",
          title: kind === "J1" ? "Échéance demain" : "Échéance dans 3 jours",
          message: `La tâche "${task.title}" n'est pas encore terminée.`,
          entity_type: "task",
          entity_id: task.id,
          link: "/dashboard/tasks",
          category: "tasks",
        });
      }

      // ---- Email automatique (anti-doublon, skip si déjà rendu) ----
      const result = await sendAssignmentReminderEmailToUser({
        taskId: task.id,
        userId: student.id,
        email: student.email,
        firstName: student.first_name,
        taskTitle: task.title,
        subjectName,
        dueDate: due,
        daysLeft: kind === "J1" ? "1" : "3",
      });

      if (result.ok && !result.skipped) stats.emailsSent++;
      else if (result.skipped) stats.emailsSkipped++;
      else {
        stats.emailsFailed++;
        if (result.error) stats.errors.push(`${task.title} → ${student.email} : ${result.error}`);
      }
    }
  }

  return NextResponse.json({ ok: true, ...stats, at: now.toISOString() });
}
