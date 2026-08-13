import { createClient } from "@/lib/supabase/server";
import { ChatRoom } from "@/components/ChatRoom";
import { PageHeader } from "@/components/PageHeader";
import { MessageSquare } from "lucide-react";

export default async function ChatPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("class_id, role, first_name, last_name")
    .eq("id", user!.id)
    .single();

  const { data: messages } = await supabase
    .from("chat_messages")
    .select("*, profiles(first_name, last_name)")
    .eq("class_id", profile?.class_id ?? "")
    .order("created_at", { ascending: true })
    .limit(100);

  const formatted = (messages ?? []).map((m: any) => ({
    ...m,
    author_name: `${m.profiles?.first_name ?? ""} ${m.profiles?.last_name ?? ""}`.trim(),
  }));

  return (
    <div className="space-y-5">
      <PageHeader
        icon={MessageSquare}
        title="Chat de classe"
        description="Échangez avec toute la promotion en temps réel."
      />
      <ChatRoom
        classId={profile!.class_id!}
        currentUserId={user!.id}
        currentUserName={`${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim() || "Vous"}
        canModerate={profile?.role === "ADMIN" || profile?.role === "DELEGATE"}
        canPostAnnouncement={profile?.role === "ADMIN" || profile?.role === "DELEGATE"}
        initialMessages={formatted}
      />
    </div>
  );
}
