import { createClient } from "@/lib/supabase/server";
import { ChatRoom } from "@/components/ChatRoom";
import { PageHeader } from "@/components/PageHeader";
import { CHAT_INITIAL_PAGE_SIZE } from "@/lib/chat/pagination";
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

  // F2 — Pagination : on charge uniquement les 100 messages les plus récents
  // (ordre DESC), puis on inverse pour l'affichage chronologique. Les plus
  // anciens sont chargés progressivement côté client (curseur created_at + id).
  const classId = profile?.class_id ?? "";

  // 2 requêtes indépendantes → parallélisées
  const [{ data: messages }, { count }] = await Promise.all([
    supabase
      .from("chat_messages")
      .select("id, class_id, author_id, content, is_announcement, created_at, profiles(first_name, last_name)")
      .eq("class_id", classId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(CHAT_INITIAL_PAGE_SIZE),
    supabase
      .from("chat_messages")
      .select("id", { count: "exact", head: true })
      .eq("class_id", classId),
  ]);

  const formatted = (messages ?? [])
    .map((m: any) => ({
      ...m,
      author_name: `${m.profiles?.first_name ?? ""} ${m.profiles?.last_name ?? ""}`.trim(),
    }))
    .reverse();

  return (
    <div className="space-y-5">
      <PageHeader
        icon={MessageSquare}
        title="Chat de classe"
        description="Échangez avec toute la promotion en temps réel."
      />
      <ChatRoom
        key={classId}
        classId={profile!.class_id!}
        currentUserId={user!.id}
        currentUserName={`${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim() || "Vous"}
        canModerate={profile?.role === "ADMIN" || profile?.role === "DELEGATE"}
        canPostAnnouncement={profile?.role === "ADMIN" || profile?.role === "DELEGATE"}
        initialMessages={formatted}
        initialHasMore={(count ?? 0) > formatted.length}
      />
    </div>
  );
}
