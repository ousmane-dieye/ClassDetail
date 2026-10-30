"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Megaphone, X, Send, Trash2, ChevronUp } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { sendChatMessageAction, sendAnnouncementAction, deleteChatMessageAction } from "@/actions/chat";
import { buildOlderMessagesFilter, mergeOlderMessages, CHAT_PAGE_SIZE } from "@/lib/chat/pagination";
import type { ChatMessageRow } from "@/types/database.types";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { toast } from "@/lib/toast";

interface Props {
  classId: string;
  currentUserId: string;
  currentUserName: string;
  canModerate: boolean;
  canPostAnnouncement: boolean;
  initialMessages: (ChatMessageRow & { author_name: string })[];
  initialHasMore?: boolean;
}

type DisplayMessage = ChatMessageRow & { author_name: string; temp_id?: string };

function makeTempId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// F2 — Pagination par curseur (created_at + id) : charge les messages plus
// anciens qu'un message donné, par lots de CHAT_PAGE_SIZE. L'ordre total
// stable `created_at DESC, id DESC` garantit l'absence de doublons et de
// pertes (voir lib/chat/pagination.ts).
export function ChatRoom({
  classId,
  currentUserId,
  currentUserName,
  canModerate,
  canPostAnnouncement,
  initialMessages,
  initialHasMore = false,
}: Props) {
  const [messages, setMessages] = useState<DisplayMessage[]>(initialMessages);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [announceMode, setAnnounceMode] = useState(false);
  const [announceContent, setAnnounceContent] = useState("");
  const [messageInput, setMessageInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const supabase = useMemo(() => createClient(), []);

  const authorNamesRef = useRef<Map<string, string> | null>(null);
  if (authorNamesRef.current === null) {
    authorNamesRef.current = new Map(initialMessages.map((m) => [m.author_id, m.author_name]));
  }

  const loadOlder = async () => {
    if (isLoadingOlder || !hasMore) return;
    const oldest = messages[0];
    if (!oldest) return;
    setIsLoadingOlder(true);
    try {
      const { data, error } = await supabase
        .from("chat_messages")
        .select("*, profiles(first_name, last_name)")
        .eq("class_id", classId)
        .or(buildOlderMessagesFilter({ createdAt: oldest.created_at, id: oldest.id }))
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(CHAT_PAGE_SIZE);

      if (error) return;
      const older = (data ?? [])
        .map((m) => ({
          ...m,
          author_name: `${m.profiles?.first_name ?? ""} ${m.profiles?.last_name ?? ""}`.trim(),
        }))
        .reverse();

      for (const m of older) {
        if (!authorNamesRef.current?.has(m.author_id)) {
          authorNamesRef.current?.set(m.author_id, m.author_name);
        }
      }

      setMessages((prev) => mergeOlderMessages(prev, older, CHAT_PAGE_SIZE).merged);
      setHasMore(older.length === CHAT_PAGE_SIZE);
    } finally {
      setIsLoadingOlder(false);
    }
  };

  useEffect(() => {
    const channel = supabase
      .channel(`chat-${classId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `class_id=eq.${classId}` },
        (payload) => {
          const msg = payload.new as ChatMessageRow;
          setMessages((prev) => {
            const pending = prev.find((p) => p.temp_id && p.author_id === msg.author_id && p.content === msg.content);
            const base = pending ? prev.filter((p) => p.temp_id !== pending.temp_id) : prev;
            if (base.some((m) => m.id === msg.id)) return base;
            const cached = authorNamesRef.current?.get(msg.author_id);
            return [...base, { ...msg, author_name: cached ?? "…" }];
          });
          if (!authorNamesRef.current?.has(msg.author_id)) {
            void supabase
              .from("profiles")
              .select("first_name, last_name")
              .eq("id", msg.author_id)
              .maybeSingle()
              .then(({ data }) => {
                if (!data) return;
                const name = `${data.first_name ?? ""} ${data.last_name ?? ""}`.trim() || "…";
                authorNamesRef.current?.set(msg.author_id, name);
                setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, author_name: name } : m)));
              });
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "chat_messages", filter: `class_id=eq.${classId}` },
        (payload) => {
          setMessages((prev) => prev.filter((m) => m.id !== (payload.old as ChatMessageRow).id));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [classId, supabase]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const postAnnouncement = (formData: FormData) => {
    const content = String(formData.get("content") ?? "").trim();
    const tempId = makeTempId();
    if (content) {
      setMessages((prev) => [
        ...prev,
        {
          id: tempId,
          class_id: classId,
          author_id: currentUserId,
          content,
          is_announcement: true,
          created_at: new Date().toISOString(),
          author_name: currentUserName,
          temp_id: tempId,
        },
      ]);
    }
    startTransition(() => {
      void sendAnnouncementAction(formData).then((res) => {
        if (res.success) {
          setAnnounceContent("");
          setAnnounceMode(false);
          toast.success("Annonce de classe publiée avec succès.");
        } else {
          setMessages((prev) => prev.filter((m) => m.temp_id !== tempId));
          toast.error(res.error ?? "Impossible de publier l'annonce.");
        }
      });
    });
  };

  const handleSendMessage = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const content = messageInput.trim();
    if (!content) return;
    const formData = new FormData(e.currentTarget);
    const tempId = makeTempId();
    setMessageInput("");
    setMessages((prev) => [
      ...prev,
      {
        id: tempId,
        class_id: classId,
        author_id: currentUserId,
        content,
        is_announcement: false,
        created_at: new Date().toISOString(),
        author_name: currentUserName,
        temp_id: tempId,
      },
    ]);
    startTransition(() => {
      void sendChatMessageAction(formData).then((res) => {
        if (!res.success) {
          setMessages((prev) => prev.filter((m) => m.temp_id !== tempId));
          toast.error(res.error ?? "Échec de l'envoi du message.");
        }
      });
    });
  };

  const handleDeleteMessage = (id: string) => {
    const removed = messages.find((m) => m.id === id);
    setMessages((prev) => prev.filter((m) => m.id !== id));
    if (removed?.temp_id) return;
    startTransition(() => {
      void deleteChatMessageAction(id).then((res) => {
        if (!res.success && removed) {
          setMessages((prev) => (prev.some((m) => m.id === id) ? prev : [...prev, removed]));
          toast.error(res.error ?? "Impossible de supprimer le message.");
        } else if (res.success) {
          toast.success("Message supprimé.");
        }
      });
    });
  };

  return (
    <Card className="flex h-[72vh] flex-col overflow-hidden shadow-lift">
      {/* Zone des messages */}
      <div className="flex-1 space-y-3.5 overflow-y-auto p-4 sm:p-6 bg-card/40">
        {hasMore && (
          <div className="flex justify-center pb-1">
            <button
              type="button"
              onClick={() => void loadOlder()}
              disabled={isLoadingOlder}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-4 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
            >
              <ChevronUp size={14} />
              <span>{isLoadingOlder ? "Chargement…" : "Charger les messages précédents"}</span>
            </button>
          </div>
        )}
        {messages.map((m) => {
          const isAnnouncement = Boolean((m as ChatMessageRow).is_announcement);
          const isMine = m.author_id === currentUserId;

          return isAnnouncement ? (
            <div key={m.id} className="group relative flex items-start justify-between rounded-2xl border border-warning/40 bg-warning/10 p-4 shadow-subtle animate-fade-in">
              <div className="space-y-1 max-w-[90%]">
                <div className="flex items-center gap-2">
                  <Badge variant="warning" className="gap-1">
                    <Megaphone size={12} />
                    <span>Annonce Officielle</span>
                  </Badge>
                  <span className="text-xs font-semibold text-foreground">— {m.author_name}</span>
                </div>
                <p className="whitespace-pre-wrap text-sm text-foreground leading-relaxed pt-1">{m.content}</p>
                <p className="text-[10px] text-muted-foreground pt-1">
                  {new Date(m.created_at).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>

              {(canModerate || m.author_id === currentUserId) && (
                <button
                  onClick={() => handleDeleteMessage(m.id)}
                  className="rounded-lg p-1.5 text-danger opacity-0 transition-opacity group-hover:opacity-100 hover:bg-danger/10"
                  title="Supprimer l'annonce"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          ) : (
            <div key={m.id} className={`group flex flex-col ${isMine ? "items-end" : "items-start"}`}>
              <div className={`relative max-w-[85%] rounded-2xl p-3 sm:max-w-[70%] shadow-subtle ${isMine ? "rounded-br-xs bg-primary text-primary-foreground" : "rounded-bl-xs bg-card border border-border text-foreground"}`}>
                <div className="flex items-center justify-between gap-3 mb-1">
                  <span className={`text-xs font-bold ${isMine ? "text-primary-foreground/90" : "text-primary"}`}>
                    {isMine ? "Vous" : m.author_name}
                  </span>
                  <span className={`text-[10px] ${isMine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                    {new Date(m.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
                <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{m.content}</p>
              </div>

              {(canModerate || m.author_id === currentUserId) && (
                <button
                  onClick={() => handleDeleteMessage(m.id)}
                  className="mt-1 text-[11px] text-danger opacity-0 transition-opacity group-hover:opacity-100 hover:underline"
                >
                  Supprimer
                </button>
              )}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Formulaire d'annonce */}
      {announceMode && (
        <form action={postAnnouncement} className="flex flex-col gap-2.5 border-t border-warning/30 bg-warning/10 p-4 animate-fade-in">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-xs font-bold text-warning uppercase tracking-wider">
              <Megaphone size={14} /> Publication d'Annonce de Classe
            </p>
            <button
              type="button"
              onClick={() => {
                setAnnounceMode(false);
                setAnnounceContent("");
              }}
              className="rounded-lg p-1 text-muted-foreground hover:bg-muted"
            >
              <X size={16} />
            </button>
          </div>
          <input type="hidden" name="classId" value={classId} />
          <Textarea
            name="content"
            value={announceContent}
            onChange={(e) => setAnnounceContent(e.target.value)}
            required
            rows={2}
            maxLength={2000}
            placeholder="Rédigez l'annonce officielle pour la promotion..."
          />
          <Button
            type="submit"
            variant="warning"
            isLoading={isPending}
            loadingText="Publication…"
            disabled={isPending || !announceContent.trim()}
            className="self-end gap-2"
          >
            <Megaphone size={16} />
            <span>Publier l'annonce</span>
          </Button>
        </form>
      )}

      {/* Formulaire de message standard */}
      <form onSubmit={handleSendMessage} className="flex items-center gap-2 border-t border-border bg-card p-3 sm:p-4">
        <input type="hidden" name="classId" value={classId} />
        <Input
          name="content"
          value={messageInput}
          onChange={(e) => setMessageInput(e.target.value)}
          required
          placeholder="Envoyer un message à la classe…"
          className="flex-1"
          disabled={isPending}
        />
        {canPostAnnouncement && (
          <Button
            type="button"
            variant={announceMode ? "warning" : "outline"}
            onClick={() => setAnnounceMode((v) => !v)}
            title="Publier une annonce de classe"
            size="icon"
          >
            <Megaphone size={18} />
          </Button>
        )}
        <Button
          type="submit"
          disabled={isPending || !messageInput.trim()}
          isLoading={isPending}
          size="icon"
          aria-label="Envoyer le message"
        >
          <Send size={18} />
        </Button>
      </form>
    </Card>
  );
}
