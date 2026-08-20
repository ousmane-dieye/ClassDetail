"use server";

import { createClient } from "@/lib/supabase/server";
import { taskSchema } from "@/lib/validation/schemas";
import { revalidatePath } from "next/cache";
import { notifyClassMembers } from "@/lib/notifications/service";

export async function createTaskAction(formData: FormData) {
  const parsed = taskSchema.safeParse({
    classId: formData.get("classId"),
    subjectId: formData.get("subjectId"),
    title: formData.get("title"),
    description: formData.get("description") || undefined,
    type: formData.get("type"),
    dueDate: formData.get("dueDate"),
    attachmentLink: formData.get("attachmentLink") || "",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide" };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Non authentifié" };

  // Autorisation vérifiée réellement par RLS (ADMIN ou DELEGATE de la classe).
  const { data: created, error } = await supabase
    .from("tasks")
    .insert({
      class_id: parsed.data.classId,
      subject_id: parsed.data.subjectId,
      creator_id: user.id,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      type: parsed.data.type,
      due_date: parsed.data.dueDate.toISOString(),
      attachment_link: parsed.data.attachmentLink || null,
    })
    .select("id, class_id")
    .single();

  if (error) return { error: error.message };

  // Notification aux membres de la classe (service role, côté serveur).
  await notifyClassMembers({
    classId: parsed.data.classId,
    excludeUserId: user.id,
    type: "ASSIGNMENT_CREATED",
    title: "📝 Nouveau devoir",
    message: `Nouveau devoir : ${parsed.data.title}`,
    entityType: "task",
    entityId: created?.id ?? null,
    link: "/dashboard/tasks",
  });

  revalidatePath("/dashboard/tasks");
  return { success: true };
}

export async function toggleTaskCompletionAction(taskId: string, completed: boolean) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Non authentifié" };

  if (completed) {
    const { error } = await supabase
      .from("task_completions")
      .upsert(
        { task_id: taskId, student_id: user.id, completed_at: new Date().toISOString() },
        { onConflict: "task_id,student_id" }
      );
    if (error) return { error: error.message };

    // Notification « tâche terminée » (événement collaboratif de classe).
    // 2 queries indépendantes → parallélisées
    const [{ data: task }, { data: me }] = await Promise.all([
      supabase
        .from("tasks")
        .select("class_id, title, subject_id")
        .eq("id", taskId)
        .maybeSingle(),
      supabase.from("profiles").select("first_name, last_name").eq("id", user.id).maybeSingle(),
    ]);
    if (task) {
      const who = `${me?.first_name ?? ""} ${me?.last_name ?? ""}`.trim() || "Un étudiant";
      await notifyClassMembers({
        classId: task.class_id,
        excludeUserId: user.id,
        type: "TASK_COMPLETED",
        title: "✅ Tâche terminée",
        message: `${who} a terminé : ${task.title}`,
        entityType: "task",
        entityId: taskId,
        link: "/dashboard/tasks",
      });
    }
  } else {
    const { error } = await supabase
      .from("task_completions")
      .delete()
      .eq("task_id", taskId)
      .eq("student_id", user.id);
    if (error) return { error: error.message };
  }

  revalidatePath("/dashboard/tasks");
  return { success: true };
}

export async function updateTaskAction(formData: FormData) {
  const taskId = formData.get("taskId");
  if (typeof taskId !== "string" || !taskId) {
    return { error: "Tâche invalide" };
  }

  const parsed = taskSchema.safeParse({
    classId: formData.get("classId"),
    subjectId: formData.get("subjectId"),
    title: formData.get("title"),
    description: formData.get("description") || undefined,
    type: formData.get("type"),
    dueDate: formData.get("dueDate"),
    attachmentLink: formData.get("attachmentLink") || "",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide" };
  }

  // Autorisation vérifiée par RLS (ADMIN ou DELEGATE de la classe de la tâche).
  const supabase = createClient();
  const { error } = await supabase
    .from("tasks")
    .update({
      subject_id: parsed.data.subjectId,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      type: parsed.data.type,
      due_date: parsed.data.dueDate.toISOString(),
      attachment_link: parsed.data.attachmentLink || null,
    })
    .eq("id", taskId);

  if (error) return { error: error.message };

  await notifyClassMembers({
    classId: parsed.data.classId,
    type: "ASSIGNMENT_UPDATED",
    title: "🔔 Devoir modifié",
    message: `Le devoir « ${parsed.data.title} » a été modifié`,
    entityType: "task",
    entityId: taskId,
    link: "/dashboard/tasks",
  });

  revalidatePath("/dashboard/tasks");
  return { success: true };
}

export async function deleteTaskAction(taskId: string) {
  const supabase = createClient();
  const { error } = await supabase.from("tasks").delete().eq("id", taskId);
  if (error) return { error: error.message };

  revalidatePath("/dashboard/tasks");
  return { success: true };
}
