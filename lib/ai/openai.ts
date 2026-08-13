/**
 * Intégration OpenAI pour l'assistant — CÔTÉ SERVEUR UNIQUEMENT.
 *
 * - L'appel à l'API OpenAI ne se fait JAMAIS depuis le navigateur.
 * - Boucle d'outils (ReAct) : le modèle peut appeler les outils internes
 *   (getMyAssignments, getUpcomingDeadlines, …) ; les résultats sont injectés
 *   dans la conversation et le modèle peut enchaîner jusqu'à 4 itérations.
 * - Aucun secret n'est exposé ; les erreurs sont loggées sans clé.
 * - En l'absence de OPENAI_API_KEY, la fonction retourne un message explicatif
 *   (jamais de crash) pour rester dégradable.
 */

import { TOOL_DEFINITIONS, executeTool, type ToolContext } from "@/lib/ai/tools";
import type { AssistantAction } from "@/types/database.types";

const OPENAI_URL =
  process.env.OPENAI_BASE_URL || "https://api.openai.com/v1/chat/completions";
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const MAX_ITERATIONS = 4;
const REQUEST_TIMEOUT_MS = 30_000;

export interface OpenAIChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
  tool_call_id?: string;
  tool_calls?: unknown[];
}

export interface AssistantReply {
  content: string;
  actions: AssistantAction[];
  /** true si OpenAI n'était pas configuré / en erreur (mode dégradé). */
  degraded: boolean;
}

/** Construit le message système avec le contexte de la plateforme. */
export function buildSystemPrompt(input: {
  firstName: string;
  role: string;
  className: string | null;
  now: Date;
}): string {
  const roleLabel =
    input.role === "ADMIN" ? "administrateur"
    : input.role === "DELEGATE" ? "délégué de classe"
    : "étudiant";
  const nowFr = input.now.toLocaleString("fr-FR", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: process.env.NEXT_PUBLIC_APP_TIMEZONE || "Africa/Dakar",
  });

  return [
    `Tu es l'assistant officiel de ClassPulse, une plateforme académique pour étudiants.`,
    `Tu t'adresses à ${input.firstName}, qui a le rôle ${roleLabel}${input.className ? ` dans la classe ${input.className}` : ""}.`,
    `Date et heure actuelles : ${nowFr}.`,
    ``,
    `RÈGLES :`,
    `1. Réponds en français, de façon concise, claire et utile. Utilise le markdown (gras, listes, tableaux simples) quand c'est pertinent.`,
    `2. Pour TOUTE question de données (devoirs, tâches, cours, documents, hints, notifications, messages, échéances), tu DOIS appeler l'outil correspondant. Ne cite JAMAIS un chiffre, une date, un devoir ou une ressource que tu n'as pas réellement lus via les outils.`,
    `3. Les résultats des outils reflètent exactement ce que l'utilisateur a le droit de voir (RLS). Ne demande jamais de contourner les permissions.`,
    `4. Lorsque l'utilisateur veut accéder à une page (devoirs, messages, cours…), propose 1 à 3 boutons via l'outil suggestActions avec des liens INTERNES uniquement.`,
    `5. Pour « que dois-je faire aujourd'hui / mes priorités », utilise getUpcomingDeadlines puis propose un ordre de priorité selon les échéances.`,
    `6. Si une information n'existe pas ou que tu ne peux pas la vérifier, dis-le honnêtement. N'invente jamais d'URL, de lien ou de ressource.`,
    `7. Reste pédagogique : tu peux détailler quand on te le demande, mais reste bref par défaut.`,
    `8. PÉRIMÈTRE STRICT : tu ne réponds qu'aux questions liées à la plateforme ClassPulse et à la vie de la classe (tâches, devoirs, cours, documents, hints, chat, notifications, statistiques, organisation). Pour TOUTE autre question (politique, finances, crypto, santé, religion, relations, jeux, culture générale, mathématiques ou code hors plateforme, etc.), refuse poliment et rappelle que tu es limité à ClassPulse.`,
  ].join("\n");
}

/** Normalise un bloc de messages pour l'API OpenAI (le format system/tool est géré). */
function toApiMessages(messages: OpenAIChatMessage[]): Record<string, unknown>[] {
  return messages.map((m) => {
    const base: Record<string, unknown> = { role: m.role, content: m.content };
    if (m.tool_call_id) base.tool_call_id = m.tool_call_id;
    if (m.tool_calls) base.tool_calls = m.tool_calls;
    return base;
  });
}

/** Appelle OpenAI avec la boucle d'outils. Ne JETTE JAMAIS : retourne un repli en cas d'erreur. */
export async function generateAssistantReply(
  initialMessages: OpenAIChatMessage[],
  ctx: ToolContext
): Promise<AssistantReply> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      content:
        "L'assistant IA n'est pas encore configuré (clé OpenAI absente). Ajoutez `OPENAI_API_KEY` dans les variables d'environnement du serveur pour l'activer. En attendant, je peux quand même vous orienter : utilisez les boutons ci-dessous pour naviguer dans la plateforme.",
      actions: [{ label: "Mes devoirs", href: "/dashboard/tasks" }],
      degraded: true,
    };
  }

  const messages: OpenAIChatMessage[] = [...initialMessages];
  let actions: AssistantAction[] = [];

  try {
    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      const res = await fetch(OPENAI_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: MODEL,
          messages: toApiMessages(messages),
          tools: TOOL_DEFINITIONS.map((t) => ({
            type: "function",
            function: {
              name: t.name,
              description: t.description,
              parameters: t.parameters,
            },
          })),
          tool_choice: "auto",
          temperature: 0.4,
          max_tokens: 900,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.error("Assistant : OpenAI HTTP %s (sans clé ni corps).", res.status);
        return {
          content: "L'assistant rencontre une erreur temporaire avec le service IA. Réessayez dans un instant.",
          actions,
          degraded: true,
        };
      }

      const json = (await res.json()) as {
        choices?: { message?: { content?: string | null; tool_calls?: unknown[] } }[];
      };
      const message = json.choices?.[0]?.message;
      if (!message) {
        return { content: "Réponse IA vide. Réessayez.", actions, degraded: true };
      }

      const toolCalls = message.tool_calls ?? [];
      if (toolCalls.length === 0) {
        return { content: message.content ?? "", actions, degraded: false };
      }

      // Ajoute le message assistant avec les tool_calls, puis exécute chaque outil.
      messages.push({
        role: "assistant",
        content: message.content ?? "",
        tool_calls: toolCalls,
      });

      for (const raw of toolCalls) {
        const tc = raw as { id?: string; function?: { name?: string; arguments?: string } };
        const fnName = tc.function?.name ?? "";
        const argsRaw = tc.function?.arguments ?? "{}";
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(argsRaw) as Record<string, unknown>;
        } catch {
          args = {};
        }

        const result = await executeTool(fnName, args, ctx);
        if (fnName === "suggestActions" && result.actions) {
          actions = result.actions;
        }

        messages.push({
          role: "tool",
          tool_call_id: tc.id ?? `call_${i}_${fnName}`,
          content: result.content,
        });
      }
    }

    return {
      content: "Je n'ai pas pu finaliser ma réponse après plusieurs tentatives. Reformulez votre question.",
      actions,
      degraded: true,
    };
  } catch (err) {
    console.error("Assistant : erreur OpenAI (détail sans clé) :", (err as Error)?.message ?? "inconnue");
    return {
      content: "L'assistant a rencontré une erreur inattendue. Vérifiez votre connexion et réessayez.",
      actions,
      degraded: true,
    };
  }
}
