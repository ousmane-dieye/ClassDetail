"use server";

import { createClient } from "@/lib/supabase/server";
import { recordingSchema } from "@/lib/validation/schemas";
import { revalidatePath } from "next/cache";
import { notifyClassMembers } from "@/lib/notifications/service";

export async function createRecordingAction(formData: FormData) {
  const parsed = recordingSchema.safeParse({
    classId: formData.get("classId"),
    subjectId: formData.get("subjectId"),
    title: formData.get("title"),
    date: formData.get("date"),
    description: formData.get("description") || undefined,
    driveUrl: formData.get("driveUrl"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Non authentifié" };

  const { data: created, error } = await supabase
    .from("recordings")
    .insert({
      class_id: parsed.data.classId,
      subject_id: parsed.data.subjectId,
      title: parsed.data.title,
      date: parsed.data.date.toISOString().slice(0, 10),
      description: parsed.data.description ?? null,
      drive_url: parsed.data.driveUrl,
      creator_id: user.id,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };

  await notifyClassMembers({
    classId: parsed.data.classId,
    excludeUserId: user.id,
    type: "RECORDING_ADDED",
    title: "🎓 Nouveau cours enregistré",
    message: `Un cours enregistré a été ajouté : ${parsed.data.title}`,
    entityType: "recording",
    entityId: created?.id ?? null,
    link: "/dashboard/recordings",
  });

  revalidatePath("/dashboard/recordings");
  return { success: true };
}

export async function deleteRecordingAction(id: string) {
  const supabase = createClient();
  const { error } = await supabase.from("recordings").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/dashboard/recordings");
  return { success: true };
}
