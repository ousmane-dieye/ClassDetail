"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Sparkles, X, Plus, Trash2, Send, History, Loader2, Bot } from "lucide-react";
import {
  createChatAction,
  getChatsAction,
  getChatMessagesAction,
  deleteChatAction,
  type AssistantChatSummary,
  type AssistantMessageView,
} from "@/actions/assistant";
import { Markdown } from "./Markdown";
import Link from "next/link";
import { Button } from "@/components/ui/Button";

const QUICK_ACTIONS = [
  { label: "Mes devoirs", prompt: "Montre-moi mes devoirs." },
  { label: "Mes tâches", prompt: "Quelles sont mes tâches ?" },
  { label: "Mes cours", prompt: "Montre-moi mes cours enregistrés." },
  { label: "Mes deadlines", prompt: "Quels sont mes devoirs urgents cette semaine ?" },
  { label: "Mes notifications", prompt: "Ai-je de nouvelles notifications non lues ?" },
];

interface StreamEvent {
  type: "delta" | "done" | "error";
  text?: string;
  chatId?: string;
  messageId?: string;
  actions?: Array<{ label: string; href: string }>;
}

export function AssistantPanel({ onClose }: { onClose: () => void }) {
  const [chats, setChats] = useState<AssistantChatSummary[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AssistantMessageView[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [streamActions, setStreamActions] = useState<Array<{ label: string; href: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const loadChats = useCallback(async () => {
    const res = await getChatsAction();
    setChats(res.chats ?? []);
    return res.chats ?? [];
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const list = await loadChats();
      if (cancelled) return;
      if (list.length > 0) {
        setActiveChatId(list[0]!.id);
        const msgs = await getChatMessagesAction(list[0]!.id);
        if (!cancelled) setMessages(msgs.messages);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadChats]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, streamText, sending]);

  const handleNewChat = useCallback(async () => {
    const res = await createChatAction();
    if (res.chatId) {
      setActiveChatId(res.chatId);
      setMessages([]);
      setError(null);
      setStreamText("");
      setShowHistory(false);
      inputRef.current?.focus();
    } else if (res.error) {
      setError(res.error);
    }
  }, []);

  const handleSelectChat = useCallback(async (chatId: string) => {
    setActiveChatId(chatId);
    setMessages([]);
    setStreamText("");
    setError(null);
    setShowHistory(false);
    const msgs = await getChatMessagesAction(chatId);
    setMessages(msgs.messages);
  }, []);

  const handleDeleteChat = useCallback(
    async (chatId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if (!window.confirm("Supprimer cette conversation avec l'assistant ?")) return;
      const res = await deleteChatAction(chatId);
      if (res.error) {
        setError(res.error);
        return;
      }
      const list = await loadChats();
      setChats(list);
      if (activeChatId === chatId) {
        setMessages([]);
        setStreamText("");
        if (list.length > 0) {
          setActiveChatId(list[0]!.id);
          const msgs = await getChatMessagesAction(list[0]!.id);
          setMessages(msgs.messages);
        } else {
          setActiveChatId(null);
        }
      }
    },
    [activeChatId, loadChats]
  );

  const sendMessage = useCallback(
    async (rawPrompt?: string) => {
      const content = (rawPrompt ?? input).trim();
      if (!content || sending) return;

      setInput("");
      setError(null);
      setStreamText("");
      setStreamActions([]);

      const userMsg: AssistantMessageView = {
        id: `local-${Date.now()}`,
        role: "user",
        content,
        actions: [],
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setSending(true);

      try {
        const res = await fetch("/api/assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chatId: activeChatId, content }),
        });

        if (!res.ok || !res.body) {
          let msg = "L'assistant a rencontré une erreur.";
          try {
            const data = (await res.json()) as { error?: string };
            if (data.error) msg = data.error;
          } catch {
            /* ignore */
          }
          setError(msg);
          setSending(false);
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let streamed = "";
        let finalChatId = activeChatId;
        let finalMessageId = "";
        let finalActions: Array<{ label: string; href: string }> = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() ?? "";
          for (const part of parts) {
            const line = part.trim();
            if (!line.startsWith("data:")) continue;
            try {
              const evt = JSON.parse(line.slice(5).trim()) as StreamEvent;
              if (evt.type === "delta" && evt.text) {
                streamed += evt.text;
                setStreamText(streamed);
              } else if (evt.type === "done") {
                finalChatId = evt.chatId ?? finalChatId;
                finalMessageId = evt.messageId ?? "";
                finalActions = evt.actions ?? [];
              } else if (evt.type === "error") {
                setError(evt.text ?? "Erreur de streaming.");
              }
            } catch {
              /* ignore */
            }
          }
        }

        streamed += getRemainingBuffer(buffer);

        setStreamingMessageId(finalMessageId);
        setStreamActions(finalActions);
        setSending(false);
        setStreamText("");

        const assistantMsg: AssistantMessageView = {
          id: finalMessageId || `local-assistant-${Date.now()}`,
          role: "assistant",
          content: streamed,
          actions: finalActions,
          created_at: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, assistantMsg]);

        if (finalChatId) setActiveChatId(finalChatId);
        void loadChats();
      } catch {
        setError("Connexion interrompue. Vérifiez votre réseau puis réessayez.");
        setSending(false);
      }
    },
    [activeChatId, input, sending, loadChats]
  );

  const getRemainingBuffer = (buf: string): string => {
    const line = buf.trim();
    if (!line.startsWith("data:")) return "";
    try {
      const evt = JSON.parse(line.slice(5).trim()) as StreamEvent;
      return evt.type === "delta" && evt.text ? evt.text : "";
    } catch {
      return "";
    }
  };

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void sendMessage();
      }
    },
    [sendMessage]
  );

  const displayMessages = sending && streamText ? [...messages, { id: `pending-${Date.now()}`, role: "assistant" as const, content: streamText, actions: [], created_at: new Date().toISOString() }] : messages;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end bg-black/50 backdrop-blur-sm sm:items-center sm:p-4 animate-fade-in" role="dialog" aria-modal="true" aria-label="Assistant IA ClassPulse">
      <div className="flex h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-border bg-background shadow-2xl sm:h-[min(85vh,720px)] sm:max-w-[460px] sm:rounded-3xl">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-border bg-card px-5 py-3.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/12 text-primary shadow-subtle">
            <Sparkles size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="font-display text-base font-bold leading-tight text-foreground">Assistant IA</p>
              <span className="flex h-1.5 w-1.5 rounded-full bg-success" />
            </div>
            <p className="truncate text-xs text-muted-foreground">
              ClassPulse · en ligne
            </p>
          </div>
          <button
            onClick={() => setShowHistory((v) => !v)}
            aria-label="Historique des conversations"
            className={`rounded-xl p-2 transition-colors hover:bg-muted ${showHistory ? "bg-muted text-primary font-bold" : "text-muted-foreground"}`}
          >
            <History size={18} />
          </button>
          <button onClick={handleNewChat} aria-label="Nouveau chat" className="rounded-xl p-2 text-muted-foreground transition-colors hover:bg-muted">
            <Plus size={18} />
          </button>
          <button onClick={onClose} aria-label="Fermer l'assistant" className="rounded-xl p-2 text-muted-foreground transition-colors hover:bg-muted">
            <X size={18} />
          </button>
        </div>

        {/* Historique */}
        {showHistory && (
          <div className="max-h-48 overflow-y-auto border-b border-border bg-muted/40 p-3 space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1 px-2">Historique des échanges</p>
            {chats.length === 0 && <p className="px-3 py-3 text-center text-xs text-muted-foreground">Aucune conversation archivée.</p>}
            {chats.map((c) => (
              <div key={c.id} className="flex items-center gap-1 rounded-xl px-2 py-1 transition-colors hover:bg-card">
                <button onClick={() => void handleSelectChat(c.id)} className={`min-w-0 flex-1 truncate rounded-lg px-2.5 py-1.5 text-left text-xs font-medium ${c.id === activeChatId ? "bg-primary/10 font-bold text-primary" : "text-foreground"}`}>
                  {c.title}
                </button>
                <button
                  onClick={(e) => void handleDeleteChat(c.id, e)}
                  aria-label={`Supprimer ${c.title}`}
                  className="rounded-lg p-1.5 text-muted-foreground hover:bg-danger/10 hover:text-danger"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-5 bg-card/20">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="animate-spin text-primary" size={24} />
            </div>
          ) : displayMessages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-primary/10 text-primary shadow-subtle">
                <Bot size={32} />
              </div>
              <div className="space-y-1 max-w-[280px]">
                <h3 className="text-base font-bold text-foreground">Comment puis-je vous aider ?</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Posez-moi des questions sur vos devoirs, vos cours, vos annales ou votre emploi du temps.
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2 max-w-xs pt-2">
                {QUICK_ACTIONS.map((qa) => (
                  <button
                    key={qa.label}
                    onClick={() => void sendMessage(qa.prompt)}
                    className="rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-medium text-foreground transition-all hover:border-primary/50 hover:text-primary hover:shadow-subtle"
                  >
                    {qa.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {displayMessages.map((m) => (
                <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] rounded-2xl p-4 shadow-subtle ${m.role === "user" ? "rounded-br-xs bg-primary text-primary-foreground" : "rounded-bl-xs border border-border bg-card text-foreground"}`}>
                    {m.role === "assistant" ? (
                      <Markdown content={m.content} />
                    ) : (
                      <p className="whitespace-pre-wrap text-sm leading-relaxed">{m.content}</p>
                    )}
                    {m.role === "assistant" && m.actions && m.actions.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2 pt-2 border-t border-border/40">
                        {m.actions.map((a, i) => (
                          <Link
                            key={i}
                            href={a.href}
                            onClick={onClose}
                            className="inline-flex items-center gap-1 rounded-xl bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/20"
                          >
                            {a.label}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {sending && !streamText && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-xs border border-border bg-card px-4 py-3.5 shadow-subtle">
                    <span className="typing-dot h-1.5 w-1.5 rounded-full bg-muted-foreground/70" />
                    <span className="typing-dot h-1.5 w-1.5 rounded-full bg-muted-foreground/70" />
                    <span className="typing-dot h-1.5 w-1.5 rounded-full bg-muted-foreground/70" />
                  </div>
                </div>
              )}
            </>
          )}

          {error && (
            <div className="rounded-xl border border-danger/30 bg-danger/10 p-3 text-center text-xs font-medium text-danger">{error}</div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Composer */}
        <div className="border-t border-border bg-card p-3 sm:p-4">
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Posez votre question à l'assistant IA…"
              rows={1}
              aria-label="Message pour l'assistant"
              className="max-h-32 min-h-[42px] flex-1 resize-none rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm font-medium outline-hidden focus:border-primary focus:ring-2 focus:ring-ring"
              style={{ height: "auto" }}
              onInput={(e) => {
                const el = e.currentTarget;
                el.style.height = "auto";
                el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
              }}
            />
            <Button
              onClick={() => void sendMessage()}
              disabled={sending || !input.trim()}
              size="icon"
              className="h-10 w-10 shrink-0 rounded-xl"
            >
              <Send size={18} />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
