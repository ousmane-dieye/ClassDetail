import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assistantUserMessageSchema } from "@/lib/validation/schemas";
import { checkRateLimit, type RateLimitResult } from "@/lib/security/rateLimit";
import { buildSystemPrompt, generateAssistantReply, type AssistantReply, type OpenAIChatMessage } from "@/lib/ai/openai";
import { checkTopicGuard } from "@/lib/ai/guard";
import type { ToolContext } from "@/lib/ai/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HOURLY_LIMIT = 60;
const HOURLY_WINDOW = 60 * 60 * 1000;
const MINUTE_LIMIT = 10;
const MINUTE_WINDOW = 60 * 1000;
const DAILY_LIMIT = Number(process.env.AI_DAILY_LIMIT) || 100;
const DAILY_WINDOW = 24 * 60 * 60 * 1000;

function sse(chunk: unknown): string {
  return `data: ${JSON.stringify(chunk)}\n\n`;
}

function badRequest(message: string, retryAfterSeconds?: number): Response {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (retryAfterSeconds !== undefined) headers["Retry-After"] = String(retryAfterSeconds);
  return new Response(JSON.stringify({ error: message }), { status: 400, headers });
}

/** Refus de rate limiting propre : message distinct si infra indisponible + Retry-After. */
function rateLimited(res: RateLimitResult, limitMessage: string): Response {
  return badRequest(
    res.unavailable ? "Service de sécurité momentanément indisponible, réessayez dans un instant." : limitMessage,
    res.retryAfterMs ? Math.ceil(res.retryAfterMs / 1000) : undefined
  );
}

/**
 * POST /api/assistant
 * Reçoit { chatId?: string, content: string }, génère la réponse IA côté
 * serveur (OpenAI + outils RBAC), la persiste puis la streame en SSE :
 *   data: {"type":"delta","text":"..."}
 *   data: {"type":"done","chatId","messageId","actions"}
 */
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response(JSON.stringify({ error: "Non authentifié" }), { status: 401 });

  // Rate limiting distribué (Supabase) : compteurs partagés entre instances.
  const hourly = await checkRateLimit(supabase, `assistant:${user.id}`, HOURLY_LIMIT, HOURLY_WINDOW);
  if (!hourly.allowed) return rateLimited(hourly, "Limite de messages IA atteinte, réessayez plus tard.");
  const perMin = await checkRateLimit(supabase, `assistant:m:${user.id}`, MINUTE_LIMIT, MINUTE_WINDOW);
  if (!perMin.allowed) return rateLimited(perMin, "Vous envoyez trop de messages à l'assistant, patientez un instant.");
  const daily = await checkRateLimit(supabase, `assistant:d:${user.id}`, DAILY_LIMIT, DAILY_WINDOW);
  if (!daily.allowed) {
    return rateLimited(daily, `Vous avez atteint la limite de ${DAILY_LIMIT} questions par jour. Réessayez demain.`);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Corps JSON invalide");
  }

  const parsed = assistantUserMessageSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message ?? "Message invalide");
  }
  const content = parsed.data.content.trim();

  // Profil + classe de l'utilisateur (pour le contexte de l'assistant).
  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name, last_name, role, class_id, classes(name)")
    .eq("id", user.id)
    .single();
  if (!profile) return new Response(JSON.stringify({ error: "Profil introuvable" }), { status: 404 });

  // Création du chat si nécessaire (chatId absent → nouveau chat).
  let chatId = parsed.data.chatId ?? null;
  if (!chatId) {
    const title = content.slice(0, 40) || "Nouveau chat";
    const { data: created, error: chatError } = await supabase
      .from("assistant_chats")
      .insert({ user_id: user.id, title })
      .select("id")
      .single();
    if (chatError || !created) {
      return badRequest("Impossible de créer la conversation.");
    }
    chatId = created.id;
  }

  // Persistance du message utilisateur.
  const { data: userMsg, error: insertUserError } = await supabase
    .from("assistant_messages")
    .insert({ chat_id: chatId, role: "user", content })
    .select("id")
    .single();
  if (insertUserError || !userMsg) {
    return badRequest("Impossible d'enregistrer le message.");
  }

  // Historique (30 derniers échanges) pour la continuité.
  const { data: history } = await supabase
    .from("assistant_messages")
    .select("role, content")
    .eq("chat_id", chatId)
    .neq("id", userMsg.id)
    .order("created_at", { ascending: false })
    .limit(30);

  const historyMessages: OpenAIChatMessage[] = [];
  if (history) {
    const reversed = [...history].reverse();
    for (const h of reversed) {
      if (h.role === "user" || h.role === "assistant") {
        historyMessages.push({ role: h.role, content: h.content });
      }
    }
  }

  // Contexte des outils (client de l'utilisateur → RLS respectée).
  const toolCtx: ToolContext = {
    user: {
      id: user.id,
      first_name: profile.first_name ?? "",
      role: profile.role,
      class_id: profile.class_id,
    },
    supabase,
  };

  const system = buildSystemPrompt({
    firstName: profile.first_name ?? "vous",
    role: profile.role,
    className: (profile as any).classes?.name ?? null,
    now: new Date(),
  });

  const messages: OpenAIChatMessage[] = [
    { role: "system", content: system },
    ...historyMessages,
    { role: "user", content },
  ];

  // Garde-fou de sujet (local, sans appel API) : bloque les questions hors périmètre.
  const refusal = checkTopicGuard(content);
  let reply: AssistantReply;
  if (refusal) {
    reply = {
      content: refusal,
      actions: [{ label: "Mes devoirs", href: "/dashboard/tasks" }],
      degraded: true,
    };
  } else {
    reply = await generateAssistantReply(messages, toolCtx);
  }

  // Persistance de la réponse + actions.
  let assistantMessageId = "";
  try {
    const { data: saved } = await supabase
      .from("assistant_messages")
      .insert({
        chat_id: chatId,
        role: "assistant",
        content: reply.content,
        actions: reply.actions ?? [],
      })
      .select("id")
      .single();
    assistantMessageId = saved?.id ?? "";
  } catch {
    // La réponse est tout de même diffusée même si la persistance échoue.
  }

  await supabase.from("assistant_chats").update({ updated_at: new Date().toISOString() }).eq("id", chatId);

  // Streaming SSE de la réponse finale (effet "frappe") + événement done.
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const chunks = reply.content.match(/.{1,24}(\s|$)/gs) ?? [reply.content];
        for (const part of chunks) {
          controller.enqueue(encoder.encode(sse({ type: "delta", text: part })));
          await new Promise((r) => setTimeout(r, 14));
        }
        controller.enqueue(
          encoder.encode(
            sse({
              type: "done",
              chatId,
              messageId: assistantMessageId,
              actions: reply.actions ?? [],
            })
          )
        );
      } catch {
        controller.enqueue(encoder.encode(sse({ type: "error", text: "Erreur de streaming." })));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
