"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  ListChecks,
  Video,
  FileText,
  Lightbulb,
  Shield,
  Megaphone,
  CalendarDays,
  ClipboardCheck,
  CheckCheck,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { markNotificationReadAction, markAllNotificationsReadAction } from "@/actions/notifications";
import type { NotificationRow, NotificationCategory } from "@/types/database.types";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { toast } from "@/lib/toast";

type FilterKey = "all" | "unread" | NotificationCategory;

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: "all", label: "Toutes" },
  { key: "unread", label: "Non lues" },
  { key: "tasks", label: "Devoirs" },
  { key: "schedule", label: "Emploi du temps" },
  { key: "evaluations", label: "Évaluations" },
  { key: "courses", label: "Cours" },
  { key: "documents", label: "Documents" },
  { key: "hints", label: "Hints" },
  { key: "announcements", label: "Annonces" },
  { key: "system", label: "Système" },
];

const CATEGORY_ICON: Record<NotificationCategory, React.ReactNode> = {
  tasks: <ListChecks size={16} className="text-success" />,
  assignments: <ListChecks size={16} className="text-success" />,
  schedule: <CalendarDays size={16} className="text-info" />,
  evaluations: <ClipboardCheck size={16} className="text-info" />,
  courses: <Video size={16} className="text-primary" />,
  documents: <FileText size={16} className="text-primary" />,
  hints: <Lightbulb size={16} className="text-warning" />,
  announcements: <Megaphone size={16} className="text-danger" />,
  system: <Shield size={16} className="text-muted-foreground" />,
};

const PAGE_SIZE = 30;

function groupLabel(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  if (sameDay(date, today)) return "Aujourd'hui";
  if (sameDay(date, yesterday)) return "Hier";
  return date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}

export function NotificationsCenter({ userId, initial }: { userId: string; initial: NotificationRow[] }) {
  const [notifications, setNotifications] = useState<NotificationRow[]>(initial);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [marking, setMarking] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`notif-center-${userId}`)
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

  const filtered = useMemo(() => {
    if (filter === "all") return notifications;
    if (filter === "unread") return notifications.filter((n) => !n.read_at);
    return notifications.filter((n) => n.category === filter);
  }, [notifications, filter]);

  const handleOpen = useCallback(
    async (n: NotificationRow) => {
      if (!n.read_at) {
        void markNotificationReadAction(n.id);
        setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)));
      }
      if (n.link) router.push(n.link);
    },
    [router]
  );

  const handleMarkAll = useCallback(async () => {
    if (marking) return;
    setMarking(true);
    try {
      await markAllNotificationsReadAction();
      setNotifications((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: new Date().toISOString() })));
      toast.success("Toutes les notifications ont été marquées comme lues.");
    } catch {
      toast.error("Impossible de marquer les notifications comme lues.");
    } finally {
      setMarking(false);
    }
  }, [marking]);

  const visibleGroups = useMemo(() => {
    const shown = filtered.slice(0, visibleCount);
    const map = new Map<string, NotificationRow[]>();
    for (const n of shown) {
      const key = groupLabel(n.created_at);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(n);
    }
    return [...map.entries()];
  }, [filtered, visibleCount]);

  const totalVisible = visibleGroups.reduce((acc, [, rows]) => acc + rows.length, 0);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <PageHeader
        icon={Bell}
        title="Centre de Notifications"
        description="Restez informé de l'activité de votre promotion en temps réel."
      >
        {unreadCount > 0 && (
          <Badge variant="danger">{unreadCount} non lue{unreadCount > 1 ? "s" : ""}</Badge>
        )}
        <Button
          onClick={() => void handleMarkAll()}
          disabled={unreadCount === 0 || marking}
          variant="outline"
          size="sm"
          className="gap-2"
        >
          {marking ? <Loader2 size={14} className="animate-spin" /> : <CheckCheck size={14} />}
          <span>Tout marquer comme lu</span>
        </Button>
      </PageHeader>

      {/* Tabs / Filters */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => {
              setFilter(f.key);
              setVisibleCount(PAGE_SIZE);
            }}
            className={`shrink-0 rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-all ${
              filter === f.key
                ? "bg-primary text-primary-foreground shadow-subtle"
                : "border border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* List */}
      {visibleGroups.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="Aucune notification"
          description="Vous êtes parfaitement à jour ! Aucune alerte enregistrée pour la catégorie sélectionnée."
        />
      ) : (
        <div className="space-y-6">
          {visibleGroups.map(([label, rows]) => (
            <div key={label} className="space-y-3">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-1">{label}</p>
              <div className="space-y-2">
                {rows.map((n) => (
                  <Card
                    key={n.id}
                    onClick={() => void handleOpen(n)}
                    className={`cursor-pointer transition-all hover:border-primary/40 ${
                      n.read_at ? "bg-card opacity-80" : "border-primary/30 bg-primary/5 font-medium shadow-subtle"
                    }`}
                  >
                    <div className="flex items-start gap-3.5 p-4">
                      <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted border border-border">
                        {CATEGORY_ICON[n.category] ?? <Bell size={18} className="text-muted-foreground" />}
                      </div>

                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-bold text-foreground text-sm truncate">{n.title}</p>
                          <span className="shrink-0 text-[11px] text-muted-foreground">
                            {new Date(n.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">{n.message}</p>
                        {n.link && (
                          <div className="flex items-center gap-1 pt-1 text-xs font-semibold text-primary">
                            <span>Accéder</span>
                            <ExternalLink size={12} />
                          </div>
                        )}
                      </div>

                      {!n.read_at && (
                        <span className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-primary badge-pulse" />
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          ))}

          {totalVisible < filtered.length && (
            <div className="flex justify-center pt-4">
              <Button
                variant="outline"
                onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
              >
                Charger plus ({filtered.length - totalVisible} restantes)
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
