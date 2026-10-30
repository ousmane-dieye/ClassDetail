"use server";

import { createClient } from "@/lib/supabase/server";
import { documentSchema } from "@/lib/validation/schemas";
import { revalidatePath } from "next/cache";
import { canDeleteResource } from "@/lib/business/permissions";
import { notifyClassMembers } from "@/lib/notifications/service";

export async function createDocumentAction(formData: FormData) {
  const parsed = documentSchema.safeParse({
    classId: formData.get("classId"),
    subjectId: formData.get("subjectId"),
    title: formData.get("title"),
    description: formData.get("description") || undefined,
    driveUrl: formData.get("driveUrl"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Non authentifié" };

  // Anti-doublon : vérifie si le fichier a déjà été partagé dans la classe
  const { data: existing } = await supabase
    .from("documents")
    .select("id")
    .eq("class_id", parsed.data.classId)
    .eq("drive_url", parsed.data.driveUrl)
    .maybeSingle();

  if (existing) {
    return { error: "Ce document existe déjà dans la bibliothèque de la classe." };
  }

  const { data: created, error } = await supabase
    .from("documents")
    .insert({
      class_id: parsed.data.classId,
      subject_id: parsed.data.subjectId,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      drive_url: parsed.data.driveUrl,
      author_id: user.id,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };

  await notifyClassMembers({
    classId: parsed.data.classId,
    excludeUserId: user.id,
    type: "DOCUMENT_ADDED",
    title: "📄 Nouveau document",
    message: `Un document a été ajouté : ${parsed.data.title}`,
    entityType: "document",
    entityId: created?.id ?? null,
    link: "/dashboard/documents",
  });

  revalidatePath("/dashboard/documents");
  return { success: true };
}

export async function deleteDocumentAction(id: string) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Non authentifié" };

  // 2 queries indépendantes → parallélisées
  const [{ data: profile }, { data: doc }] = await Promise.all([
    supabase.from("profiles").select("role, class_id").eq("id", user.id).single(),
    supabase.from("documents").select("class_id, author_id").eq("id", id).single(),
  ]);
  if (!profile) return { error: "Profil introuvable" };
  if (!doc) return { error: "Document introuvable" };

  if (!canDeleteResource({ id: user.id, role: profile.role, classId: profile.class_id }, doc.class_id, doc.author_id)) {
    return { error: "Vous n'êtes pas autorisé à supprimer ce document" };
  }

  const { error } = await supabase.from("documents").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/dashboard/documents");
  return { success: true };
}
