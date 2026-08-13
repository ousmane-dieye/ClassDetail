"use client";

/**
 * Hooks Realtime — abonnement aux changements Supabase (postgres_changes)
 * et aux canaux Broadcast (présence, frappe) avec gestion de reconnexion.
 *
 * - useRealtimeTable          : synchronise une table filtrée par class_id
 * - useRealtimeNotifications  : notifications en direct de l'utilisateur
 * - useRealtimeRefresh        : refresh ciblé de la route (listes) sans F5
 * - useSmartPolling           : polling intelligent (pause quand inactif)
 * - usePageActive             : onglet visible et focalisé
 * - useRealtimeConnection     : état de la connexion temps réel
 *
 * Les événements postgres_changes ne sont reçus que si l'utilisateur peut
 * LIRE la ligne via RLS.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { NotificationRow } from "@/types/database.types";

type RealtimeEvent = "INSERT" | "UPDATE" | "DELETE";

export type RealtimeConnectionStatus = "connecting" | "connected" | "reconnecting" | "closed";

function mapChannelStatus(status: string): RealtimeConnectionStatus {
  switch (status) {
    case "SUBSCRIBED":
      return "connected";
    case "CHANNEL_ERROR":
    case "TIMED_OUT":
      return "reconnecting";
    case "CLOSED":
      return "closed";
    default:
      return "connecting";
  }
}

// ---------------------------------------------------------------
// Activité de l'onglet (pour polling intelligent)
// ---------------------------------------------------------------

export function usePageActive(): boolean {
  const [active, setActive] = useState(true);

  useEffect(() => {
    const onVis = () => setActive(document.visibilityState === "visible");
    const onFocus = () => setActive(true);
    const onBlur = () => setActive(false);

    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  return active;
}

// ---------------------------------------------------------------
// Polling intelligent : ne tourne que si la page est active.
// ---------------------------------------------------------------

export function useSmartPolling(
  callback: () => void | Promise<void>,
  intervalMs: number,
  deps: unknown[] = []
): boolean {
  const active = usePageActive();
  const cbRef = useRef(callback);
  cbRef.current = callback;

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => void cbRef.current(), intervalMs);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, intervalMs, ...deps]);

  return active;
}

// ---------------------------------------------------------------
// Abonnement générique à une table (postgres_changes filtré RLS).
// ---------------------------------------------------------------

export interface RealtimeTableOptions<T> {
  table: string;
  /** Filtre RLS-compatible : "class_id=eq.<uuid>". */
  filter?: string;
  onInsert?: (row: T) => void;
  onUpdate?: (row: T) => void;
  onDelete?: (rowId: string) => void;
  events?: RealtimeEvent[];
}

export function useRealtimeTable<T>({ table, filter, onInsert, onUpdate, onDelete, events }: RealtimeTableOptions<T>) {
  const handlersRef = useRef({ onInsert, onUpdate, onDelete });
  handlersRef.current = { onInsert, onUpdate, onDelete };
  const eventsKey = (events ?? (["INSERT", "UPDATE", "DELETE"] as RealtimeEvent[])).join("|");

  useEffect(() => {
    const supabase = createClient();
    const handlers = handlersRef.current;

    const channel = supabase
      .channel(`rt-${table}-${filter ?? "all"}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table, ...(filter ? { filter } : {}) },
        (payload) => handlers.onInsert?.(payload.new as T)
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table, ...(filter ? { filter } : {}) },
        (payload) => handlers.onUpdate?.({ ...(payload.old as T), ...(payload.new as T) })
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table, ...(filter ? { filter } : {}) },
        (payload) => handlers.onDelete?.((payload.old as T & { id: string }).id)
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, filter, eventsKey]);
}

// ---------------------------------------------------------------
// Notifications en direct : liste + compteur non-lues.
// ---------------------------------------------------------------

export interface NotificationsState {
  notifications: NotificationRow[];
  unreadCount: number;
}

export function useRealtimeNotifications(userId: string, initial: NotificationRow[] = []): NotificationsState {
  const [notifications, setNotifications] = useState<NotificationRow[]>(initial);

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`rt-notifications-${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `recipient_id=eq.${userId}` },
        (payload) => {
          const row = payload.new as NotificationRow;
          setNotifications((prev) => [row, ...prev.filter((n) => n.id !== row.id)]);
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "notifications", filter: `recipient_id=eq.${userId}` },
        (payload) => {
          const row = payload.new as NotificationRow;
          setNotifications((prev) => prev.map((n) => (n.id === row.id ? { ...n, ...row } : n)));
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  const unreadCount = notifications.filter((n) => !n.read_at).length;
  return { notifications, unreadCount };
}

// ---------------------------------------------------------------
// Refresh ciblé : re-rend uniquement la route courante (listes).
// ---------------------------------------------------------------

export interface RealtimeRefreshOptions {
  table: string;
  filter?: string;
  events?: RealtimeEvent[];
  debounceMs?: number;
}

export function useRealtimeRefresh({ table, filter, events = ["INSERT", "UPDATE", "DELETE"], debounceMs = 500 }: RealtimeRefreshOptions) {
  const router = useRouter();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const eventsKey = events.join("|");

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(`rr-${table}-${filter ?? "all"}`);

    const schedule = () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => router.refresh(), debounceMs);
    };

    for (const event of eventsKey.split("|") as RealtimeEvent[]) {
      channel.on(
        "postgres_changes",
        { event, schema: "public", table, ...(filter ? { filter } : {}) } as any,
        schedule
      );
    }
    channel.subscribe();

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, filter, eventsKey, debounceMs]);
}

// ---------------------------------------------------------------
// État global de la connexion temps réel.
// ---------------------------------------------------------------

export function useRealtimeConnection() {
  const [status, setStatus] = useState<RealtimeConnectionStatus>("connecting");

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel("conn-health");
    channel.subscribe((channelStatus) => setStatus(mapChannelStatus(channelStatus)));

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  return status;
}
