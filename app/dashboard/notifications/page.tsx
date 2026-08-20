import { createClient } from "@/lib/supabase/server";
import { NotificationsCenter } from "@/components/notifications/NotificationsCenter";

export const metadata = {
  title: "Notifications — ClassPulse",
};

export default async function NotificationsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: notifications } = await supabase
    .from("notifications")
    .select("id, type, title, message, entity_type, entity_id, link, category, read_at, created_at")
    .eq("recipient_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <NotificationsCenter
      userId={user.id}
      initial={(notifications ?? []) as any[]}
    />
  );
}
