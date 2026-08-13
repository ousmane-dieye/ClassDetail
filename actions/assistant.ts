"use server";

/**
 * Assistant IA — Server Actions (gestion des conversations).
 * L'appel à OpenAI se fait exclusivement dans la Route Handler /api/assistant.
 */

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export interface AssistantChatSummary {
  id: string;
  title: string;
  updated_at: string;
  created_at: string;
}

export interface AssistantMessageView {
  id: string;
  role: "user" | "assistant";
  content: string;
  actions: Array<{ label: string; href: string }>;
  created_at: string;
}

/** Crée un nouveau chat pour l'utilisateur connecté. */
export async function createChatAction(title = "Nouveau chat"): Promise<{ chatId?: string; error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Non authentifié" };

  const { data, error } = await supabase
    .from("assistant_chats")
    .insert({ user_id: user.id, title: title.trim().slice(0, 60) || "Nouveau chat" })
    .select("id")
    .single();
  if (error) return { error: error.message };
  return { chatId: data.id };
}

/** Liste les conversations de l'assistant (triées par activité). */
export async function getChatsAction(): Promise<{ chats: AssistantChatSummary[] }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { chats: [] };

  const { data } = await supabase
    .from("assistant_chats")
    .select("id, title, updated_at, created_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(50);

  return { chats: (data ?? []) as AssistantChatSummary[] };
}

/** Récupère les messages d'un chat assistant (les siens uniquement via RLS). */
export async function getChatMessagesAction(chatId: string): Promise<{ messages: AssistantMessageView[] }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { messages: [] };

  const { data } = await supabase
    .from("assistant_messages")
    .select("id, role, content, actions, created_at")
    .eq("chat_id", chatId)
    .order("created_at", { ascending: true })
    .limit(100);

  const messages = ((data ?? []) as any[]).map((m) => ({
    id: m.id,
    role: m.role as "user" | "assistant",
    content: m.content as string,
    actions: Array.isArray(m.actions) ? (m.actions as Array<{ label: string; href: string }>) : [],
    created_at: m.created_at as string,
  }));

  return { messages };
}

/** Renomme un chat assistant. */
export async function renameChatAction(chatId: string, title: string) {
  const supabase = createClient();
  const clean = title.trim().slice(0, 60);
  if (!clean) return { error: "Titre vide" };

  const { error } = await supabase
    .from("assistant_chats")
    .update({ title: clean, updated_at: new Date().toISOString() })
    .eq("id", chatId);
  if (error) return { error: error.message };
  revalidatePath("/dashboard");
  return { success: true };
}

/** Supprime un chat assistant (et ses messages via cascade). */
export async function deleteChatAction(chatId: string) {
  const supabase = createClient();
  const { error } = await supabase.from("assistant_chats").delete().eq("id", chatId);
  if (error) return { error: error.message };
  return { success: true };
}
