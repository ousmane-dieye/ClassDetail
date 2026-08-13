"use server";

import { createClient } from "@/lib/supabase/server";
import { chatMessageSchema } from "@/lib/validation/schemas";
import { notifyClassMembers } from "@/lib/notifications/service";
import { revalidatePath } from "next/cache";

export async function sendChatMessageAction(formData: FormData) {
  const parsed = chatMessageSchema.safeParse({
    classId: formData.get("classId"),
    content: formData.get("content"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Non authentifié" };

  const { error } = await supabase.from("chat_messages").insert({
    class_id: parsed.data.classId,
    author_id: user.id,
    content: parsed.data.content,
  });
  if (error) return { error: error.message };

  revalidatePath("/dashboard/chat");
  return { success: true };
}

/**
 * Publie une annonce de classe (DELEGATE ou ADMIN uniquement).
 * L'annonce apparaît épinglée dans le chat ET crée une notification
 * ANNOUNCEMENT_CREATED pour chaque membre de la classe (sauf l'auteur).
 *
 * Autorisation : vérifiée en plus de la RLS (chat_insert exige d'être membre
 * de la classe) — le rôle DELEGATE/ADMIN est contrôlé côté serveur.
 */
export async function sendAnnouncementAction(formData: FormData) {
  const parsed = chatMessageSchema.safeParse({
    classId: formData.get("classId"),
    content: formData.get("content"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Non authentifié" };

  const { data: profile } = await supabase.from("profiles").select("role, first_name, last_name").eq("id", user.id).single();
  if (!profile) return { error: "Profil introuvable" };
  if (profile.role !== "ADMIN" && profile.role !== "DELEGATE") {
    return { error: "Seuls un délégué ou un administrateur peuvent publier une annonce" };
  }

  const { data: created, error } = await supabase
    .from("chat_messages")
    .insert({
      class_id: parsed.data.classId,
      author_id: user.id,
      content: parsed.data.content,
      is_announcement: true,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };

  const authorName = `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() || "Un délégué";
  await notifyClassMembers({
    classId: parsed.data.classId,
    excludeUserId: user.id,
    type: "ANNOUNCEMENT_CREATED",
    title: "🔔 Annonce",
    message: `${authorName} a publié une annonce : ${parsed.data.content.slice(0, 120)}${parsed.data.content.length > 120 ? "…" : ""}`,
    entityType: "chat",
    entityId: created?.id ?? null,
    link: "/dashboard/chat",
  });

  revalidatePath("/dashboard/chat");
  return { success: true, announcementId: created?.id ?? null };
}

export async function deleteChatMessageAction(id: string) {
  const supabase = createClient();
  const { error } = await supabase.from("chat_messages").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/dashboard/chat");
  return { success: true };
}
