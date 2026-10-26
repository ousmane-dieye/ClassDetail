"use server";

import { createClient } from "@/lib/supabase/server";
import { classSchema, subjectSchema } from "@/lib/validation/schemas";
import { revalidatePath } from "next/cache";
import { createNotification } from "@/lib/notifications/service";
import {
  HARMONIC_COLOR_ORDER,
  defaultColorForIndex,
  isSubjectColorKey,
} from "@/lib/constants/subjectColors";

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
    colorKey: formData.get("colorKey") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const supabase = createClient();
  let colorKey = parsed.data.colorKey;
  if (!colorKey) {
    // Sélection automatique de la première couleur disponible dans la classe
    const { data: existing } = await supabase
      .from("subjects")
      .select("color_key")
      .eq("class_id", parsed.data.classId);
    const used = new Set(existing?.map((s) => s.color_key));
    colorKey =
      HARMONIC_COLOR_ORDER.find((k) => !used.has(k)) ??
      defaultColorForIndex(existing?.length ?? 0);
  }

  const { error } = await supabase.from("subjects").insert({
    class_id: parsed.data.classId,
    name: parsed.data.name,
    code: parsed.data.code ?? null,
    color_key: colorKey,
  });
  if (error) return { error: error.message };

  revalidatePath("/dashboard/admin");
  revalidatePath("/dashboard/schedule");
  return { success: true };
}

export async function updateSubjectColorAction(subjectId: string, colorKey: string) {
  if (!isSubjectColorKey(colorKey)) {
    return { error: "Couleur de matière invalide." };
  }
  const supabase = createClient();
  const { error } = await supabase
    .from("subjects")
    .update({ color_key: colorKey })
    .eq("id", subjectId);
  if (error) return { error: error.message };

  revalidatePath("/dashboard/admin");
  revalidatePath("/dashboard/schedule");
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
