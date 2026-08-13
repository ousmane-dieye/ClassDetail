"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function NotificationBell({ userId, initialUnreadCount }: { userId: string; initialUnreadCount: number }) {
  const [count, setCount] = useState(initialUnreadCount);
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`bell-notifications-${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `recipient_id=eq.${userId}` },
        (payload) => {
          const row = payload.new as { read_at: string | null };
          if (!row.read_at) setCount((c) => c + 1);
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "notifications", filter: `recipient_id=eq.${userId}` },
        (payload) => {
          const oldRow = payload.old as { read_at: string | null };
          const newRow = payload.new as { read_at: string | null };
          const wasUnread = !oldRow?.read_at;
          const nowRead = Boolean(newRow?.read_at);
          if (wasUnread && nowRead) setCount((c) => Math.max(0, c - 1));
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  useEffect(() => {
    const onFocus = () => router.refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [router]);

  return (
    <Link
      href="/dashboard/notifications"
      aria-label={`Notifications${count > 0 ? `, ${count} non lues` : ""}`}
      className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-card text-foreground transition-all hover:bg-muted hover:border-primary/30 shadow-subtle"
    >
      <Bell size={18} />
      {count > 0 && (
        <span className="absolute -top-1 -right-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white shadow-subtle badge-pulse">
          {count > 9 ? "9+" : count}
        </span>
      )}
    </Link>
  );
}
