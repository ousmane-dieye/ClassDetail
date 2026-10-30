"use server";

import { createClient } from "@/lib/supabase/server";
import { hintSchema } from "@/lib/validation/schemas";
import { revalidatePath } from "next/cache";
import { canDeleteResource } from "@/lib/business/permissions";
import { notifyClassMembers } from "@/lib/notifications/service";

export async function createHintAction(formData: FormData) {
  const parsed = hintSchema.safeParse({
    classId: formData.get("classId"),
    subjectId: formData.get("subjectId"),
    title: formData.get("title"),
    year: formData.get("year"),
    type: formData.get("type"),
    driveUrl: formData.get("driveUrl"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Non authentifié" };

  // Anti-doublon : vérifie si le sujet d'examen a déjà été publié
  const { data: existing } = await supabase
    .from("hints")
    .select("id")
    .eq("class_id", parsed.data.classId)
    .eq("drive_url", parsed.data.driveUrl)
    .maybeSingle();

  if (existing) {
    return { error: "Ce hint / sujet existe déjà dans la bibliothèque." };
  }

  const { data: created, error } = await supabase
    .from("hints")
    .insert({
      class_id: parsed.data.classId,
      subject_id: parsed.data.subjectId,
      title: parsed.data.title,
      year: parsed.data.year,
      type: parsed.data.type,
      drive_url: parsed.data.driveUrl,
      author_id: user.id,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };

  await notifyClassMembers({
    classId: parsed.data.classId,
    excludeUserId: user.id,
    type: "HINT_ADDED",
    title: "💡 Nouveau hint",
    message: `Un hint a été ajouté : ${parsed.data.title}`,
    entityType: "hint",
    entityId: created?.id ?? null,
    link: "/dashboard/hints",
  });

  revalidatePath("/dashboard/hints");
  return { success: true };
}

export async function deleteHintAction(id: string) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Non authentifié" };

  // 2 queries indépendantes → parallélisées
  const [{ data: profile }, { data: hint }] = await Promise.all([
    supabase.from("profiles").select("role, class_id").eq("id", user.id).single(),
    supabase.from("hints").select("class_id, author_id").eq("id", id).single(),
  ]);
  if (!profile) return { error: "Profil introuvable" };
  if (!hint) return { error: "Hint introuvable" };

  if (!canDeleteResource({ id: user.id, role: profile.role, classId: profile.class_id }, hint.class_id, hint.author_id)) {
    return { error: "Vous n'êtes pas autorisé à supprimer ce hint" };
  }

  const { error } = await supabase.from("hints").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/dashboard/hints");
  return { success: true };
}
