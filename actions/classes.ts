"use server";

import { createClient } from "@/lib/supabase/server";
import { classSchema, subjectSchema } from "@/lib/validation/schemas";
import { revalidatePath } from "next/cache";
import { createNotification } from "@/lib/notifications/service";

export async function createClassAction(formData: FormData) {
  const parsed = classSchema.safeParse({
    name: formData.get("name"),
    level: formData.get("level"),
    academicYear: formData.get("academicYear"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const supabase = createClient();
  const { error } = await supabase.from("classes").insert({
    name: parsed.data.name,
    level: parsed.data.level,
    academic_year: parsed.data.academicYear,
  });
  if (error) return { error: error.message };

  revalidatePath("/dashboard/admin");
  return { success: true };
}

export async function deleteClassAction(id: string) {
  // RLS refuse déjà la suppression si la classe contient des membres.
  const supabase = createClient();
  const { error } = await supabase.from("classes").delete().eq("id", id);
  if (error) return { error: "Impossible de supprimer : " + error.message };
  revalidatePath("/dashboard/admin");
  return { success: true };
}

export async function createSubjectAction(formData: FormData) {
  const parsed = subjectSchema.safeParse({
    classId: formData.get("classId"),
    name: formData.get("name"),
    code: formData.get("code") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const supabase = createClient();
  const { error } = await supabase.from("subjects").insert({
    class_id: parsed.data.classId,
    name: parsed.data.name,
    code: parsed.data.code ?? null,
  });
  if (error) return { error: error.message };

  revalidatePath("/dashboard/admin");
  return { success: true };
}

export async function appointDelegateAction(userId: string) {
  const supabase = createClient();
  const { error } = await supabase.from("profiles").update({ role: "DELEGATE" }).eq("id", userId);
  if (error) return { error: error.message };

  await createNotification({
    userId,
    type: "DELEGATE_APPOINTED",
    title: "🔔 Nomination délégué",
    message: "Vous avez été promu délégué de classe. Vous pouvez désormais gérer les tâches et les cours.",
    entityType: "profile",
    entityId: userId,
    link: "/dashboard",
  });

  revalidatePath("/dashboard/admin");
  return { success: true };
}

export async function removeDelegateAction(userId: string) {
  const supabase = createClient();
  const { error } = await supabase.from("profiles").update({ role: "STUDENT" }).eq("id", userId);
  if (error) return { error: error.message };

  await createNotification({
    userId,
    type: "DELEGATE_REMOVED",
    title: "Rôle délégué retiré",
    message: "Votre rôle de délégué de classe vous a été retiré.",
    entityType: "profile",
    entityId: userId,
    link: "/dashboard",
  });

  revalidatePath("/dashboard/admin");
  return { success: true };
}
