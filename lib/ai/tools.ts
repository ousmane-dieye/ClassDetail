/**
 * Outils internes de l'assistant IA.
 *
 * SÉCURITÉ / RBAC :
 *  - Chaque outil reçoit le client Supabase de L'UTILISATEUR (cookies de session).
 *    Les policies RLS s'appliquent donc à chaque requête : un étudiant ne peut
 *    jamais lire les données privées d'un autre utilisateur, même en interrogeant
 *    l'assistant. Le service role n'est JAMAIS utilisé ici.
 *  - searchPlatform est limité à la classe de l'utilisateur (via RLS + filtre class_id).
 *  - suggestActions ne produit que des liens internes validés par une liste blanche.
 *
 * Le module est "server only" (il utilise le client serveur via le paramètre passé).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, NotificationRow } from "@/types/database.types";

export interface AssistantContextUser {
  id: string;
  first_name: string;
  role: string;
  class_id: string | null;
}

// ---------------------------------------------------------------
// Schémas OpenAI (function calling)
// ---------------------------------------------------------------

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  /** Outil "sortie" : ne produit pas de données mais des actions de navigation. */
  outputOnly?: boolean;
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "getUpcomingDeadlines",
    description:
      "Liste des devoirs/tâches à venir avec leur échéance (deadline) et le nombre de jours restants. À utiliser pour répondre à « que dois-je faire », « quels sont mes devoirs urgents », « quelle est ma charge de travail ». Paramètre days : fenêtre en jours (défaut 7, max 90).",
    parameters: {
      type: "object",
      properties: { days: { type: "number", description: "Fenêtre en jours (défaut 7)" } },
    },
  },
  {
    name: "getMyAssignments",
    description:
      "Liste de TOUS les devoirs/tâches de la classe de l'utilisateur (matière, type, échéance, lien). À utiliser pour « j'ai quoi comme devoir », « montre-moi mes devoirs », « quels devoirs cette semaine ».",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "getMyTasks",
    description:
      "Alias de getMyAssignments : liste les tâches à rendre. À utiliser quand l'utilisateur parle de « tâches ».",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "getMyCourses",
    description:
      "Liste des cours enregistrés disponibles dans la classe (cours enregistrés / recordings). À utiliser pour « mon dernier cours enregistré », « quels cours sont disponibles ».",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "getMySavedCourses",
    description: "Alias de getMyCourses : liste des cours enregistrés.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "getMyDocuments",
    description:
      "Liste des documents pédagogiques partagés dans la classe (titre, matière, lien Google Drive). À utiliser pour « j'ai reçu un nouveau document », « quels documents sont disponibles ».",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "getMyHints",
    description:
      "Liste des hints (anciens devoirs/examens) disponibles dans la classe. À utiliser pour « y a-t-il des hints », « anciens sujets ».",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "getMyNotifications",
    description:
      "Dernières notifications de l'utilisateur (devoirs, documents, rappels, annonces…). À utiliser pour « ai-je de nouvelles notifications », « qu'est-ce qui s'est passé récemment ».",
    parameters: {
      type: "object",
      properties: {
        unreadOnly: { type: "boolean", description: "Limiter aux notifications non lues (défaut false)" },
        limit: { type: "number", description: "Nombre maximum de résultats (défaut 10, max 30)" },
      },
    },
  },
  {
    name: "searchPlatform",
    description:
      "Recherche dans les ressources de la plateforme (documents, hints, cours enregistrés, tâches) limitée à la classe de l'utilisateur. À utiliser quand l'utilisateur cherche une ressource précise.",
    parameters: {
      type: "object",
      properties: { query: { type: "string", description: "Termes de recherche (titre)" } },
      required: ["query"],
    },
  },
  {
    name: "suggestActions",
    description:
      "Outil de NAVIGATION : propose 1 à 3 boutons d'action (label + href interne) pour orienter l'utilisateur vers une page de la plateforme. Utiliser UNIQUEMENT les href de la liste blanche : /dashboard, /dashboard/tasks, /dashboard/documents, /dashboard/hints, /dashboard/recordings, /dashboard/chat, /dashboard/notifications, /dashboard/stats, /dashboard/admin. Ne jamais inventer d'URL.",
    parameters: {
      type: "object",
      properties: {
        actions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              label: { type: "string", description: "Libellé court du bouton, en français" },
              href: { type: "string", description: "URL interne (liste blanche uniquement)" },
            },
            required: ["label", "href"],
          },
        },
      },
      required: ["actions"],
    },
    outputOnly: true,
  },
];

// Liste blanche des liens internes que l'assistant peut proposer.
const INTERNAL_HREFS = [
  "/dashboard",
  "/dashboard/tasks",
  "/dashboard/documents",
  "/dashboard/hints",
  "/dashboard/recordings",
  "/dashboard/chat",
  "/dashboard/notifications",
  "/dashboard/stats",
  "/dashboard/admin",
];

/** Vérifie qu'un href proposé par l'IA appartient à la liste blanche interne. */
export function isAllowedAssistantHref(href: string): boolean {
  return INTERNAL_HREFS.includes(href);
}

/** Nettoie et valide les actions proposées par l'IA. */
export function sanitizeAssistantActions(raw: unknown): Array<{ label: string; href: string }> {
  if (!Array.isArray(raw)) return [];
  const out: Array<{ label: string; href: string }> = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const { label, href } = item as { label?: unknown; href?: unknown };
    if (typeof label !== "string" || typeof href !== "string") continue;
    if (label.trim().length > 40) continue;
    if (!isAllowedAssistantHref(href)) continue;
    out.push({ label: label.trim(), href });
    if (out.length >= 3) break;
  }
  return out;
}

// ---------------------------------------------------------------
// Résultats d'outils (données réelles, format compact pour le LLM)
// ---------------------------------------------------------------

type ServerClient = SupabaseClient<Database>;

interface ToolResult {
  ok: boolean;
  content: string;
  /** Actions validées (pour l'outil suggestActions). */
  actions?: Array<{ label: string; href: string }>;
}

const toFr = (s: string): string =>
  s.toLowerCase() === "tp" ? "TP"
    : s === "ASSIGNMENT" ? "Devoir"
    : s === "EXERCISE" ? "Exercice"
    : s === "RESEARCH" ? "Recherche"
    : s === "PROJECT" ? "Projet"
    : s === "DEVOIR" ? "Devoir"
    : s === "EXAMEN" ? "Examen"
    : s === "CONTROLE" ? "Contrôle"
    : s === "AUTRE" ? "Autre"
    : s;

const fmtDate = (iso: string): string => {
  const d = new Date(iso);
  return `${d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })} à ${d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
};

function daysUntil(iso: string, now: number = Date.now()): number {
  return Math.ceil((new Date(iso).getTime() - now) / 86_400_000);
}

// ---------------------------------------------------------------
// Exécution des outils
// ---------------------------------------------------------------

export interface ToolContext {
  user: AssistantContextUser;
  supabase: ServerClient;
}

export async function executeTool(name: string, args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const { supabase, user } = ctx;
  const classId = user.class_id;

  switch (name) {
    case "getUpcomingDeadlines": {
      const days = Math.min(Math.max(Number(args.days ?? 7) || 7, 1), 90);
      const horizon = new Date(Date.now() + days * 86_400_000).toISOString();
      const { data: subjects } = await supabase.from("subjects").select("id, name").eq("class_id", classId ?? "");
      const subjectName = new Map((subjects ?? []).map((s) => [s.id, s.name]));
      const { data, error } = await supabase
        .from("tasks")
        .select("id, title, type, subject_id, due_date, is_expired, attachment_link")
        .eq("class_id", classId ?? "")
        .eq("is_expired", false)
        .lte("due_date", horizon)
        .gte("due_date", new Date().toISOString())
        .order("due_date", { ascending: true })
        .limit(30);
      if (error) return { ok: false, content: "Erreur lors de la lecture des échéances." };
      if (!data || data.length === 0) return { ok: true, content: `Aucun devoir à rendre dans les ${days} prochains jours.` };
      const lines = data.map((t) => {
        const left = daysUntil(t.due_date);
        return `- ${t.title} (${toFr(t.type)}) — ${subjectName.get(t.subject_id) ?? "Sans matière"} — échéance ${fmtDate(t.due_date)} — ${left <= 0 ? "aujourd'hui" : `dans ${left} j`}`;
      });
      return { ok: true, content: `Devoirs à rendre dans les ${days} prochains jours (${data.length}) :\n${lines.join("\n")}` };
    }

    case "getMyAssignments":
    case "getMyTasks": {
      const { data: subjects } = await supabase.from("subjects").select("id, name").eq("class_id", classId ?? "");
      const subjectName = new Map((subjects ?? []).map((s) => [s.id, s.name]));
      const { data, error } = await supabase
        .from("tasks")
        .select("id, title, type, subject_id, due_date, is_expired, attachment_link")
        .eq("class_id", classId ?? "")
        .order("due_date", { ascending: true })
        .limit(50);
      if (error) return { ok: false, content: "Erreur lors de la lecture des devoirs." };
      if (!data || data.length === 0) return { ok: true, content: "Aucun devoir/tâche publié dans votre classe." };
      const lines = data.map((t) =>
        `- ${t.title} (${toFr(t.type)}) — ${subjectName.get(t.subject_id) ?? "Sans matière"} — ${t.is_expired ? "expiré" : `échéance ${fmtDate(t.due_date)} (dans ${daysUntil(t.due_date)} j)`}${t.attachment_link ? " — lien : " + t.attachment_link : ""}`
      );
      return { ok: true, content: `Devoirs de la classe (${data.length}) :\n${lines.join("\n")}` };
    }

    case "getMyCourses":
    case "getMySavedCourses": {
      const { data: subjects } = await supabase.from("subjects").select("id, name").eq("class_id", classId ?? "");
      const subjectName = new Map((subjects ?? []).map((s) => [s.id, s.name]));
      const { data, error } = await supabase
        .from("recordings")
        .select("id, title, date, subject_id, description, drive_url")
        .eq("class_id", classId ?? "")
        .order("date", { ascending: false })
        .limit(30);
      if (error) return { ok: false, content: "Erreur lors de la lecture des cours enregistrés." };
      if (!data || data.length === 0) return { ok: true, content: "Aucun cours enregistré disponible dans votre classe." };
      const lines = data.map((r) =>
        `- ${r.title} — ${subjectName.get(r.subject_id) ?? "Sans matière"} — date ${r.date ? fmtDate(r.date) : "inconnue"}${r.description ? ` — ${r.description}` : ""} — lien : ${r.drive_url}`
      );
      return { ok: true, content: `Cours enregistrés (${data.length}) :\n${lines.join("\n")}` };
    }

    case "getMyDocuments": {
      const { data: subjects } = await supabase.from("subjects").select("id, name").eq("class_id", classId ?? "");
      const subjectName = new Map((subjects ?? []).map((s) => [s.id, s.name]));
      const { data, error } = await supabase
        .from("documents")
        .select("id, title, subject_id, description, drive_url, created_at")
        .eq("class_id", classId ?? "")
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) return { ok: false, content: "Erreur lors de la lecture des documents." };
      if (!data || data.length === 0) return { ok: true, content: "Aucun document partagé dans votre classe." };
      const lines = data.map((d) =>
        `- ${d.title} — ${subjectName.get(d.subject_id) ?? "Sans matière"} — ajouté le ${fmtDate(d.created_at)}${d.description ? ` — ${d.description}` : ""} — lien : ${d.drive_url}`
      );
      return { ok: true, content: `Documents de la classe (${data.length}) :\n${lines.join("\n")}` };
    }

    case "getMyHints": {
      const { data: subjects } = await supabase.from("subjects").select("id, name").eq("class_id", classId ?? "");
      const subjectName = new Map((subjects ?? []).map((s) => [s.id, s.name]));
      const { data, error } = await supabase
        .from("hints")
        .select("id, title, type, year, subject_id, drive_url, created_at")
        .eq("class_id", classId ?? "")
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) return { ok: false, content: "Erreur lors de la lecture des hints." };
      if (!data || data.length === 0) return { ok: true, content: "Aucun hint (ancien devoir/examen) disponible." };
      const lines = data.map((h) =>
        `- ${h.title} (${toFr(h.type)}${h.year ? `, ${h.year}` : ""}) — ${subjectName.get(h.subject_id) ?? "Sans matière"} — lien : ${h.drive_url}`
      );
      return { ok: true, content: `Hints disponibles (${data.length}) :\n${lines.join("\n")}` };
    }

    case "getMyNotifications": {
      const unreadOnly = Boolean(args.unreadOnly);
      const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 30);
      let q = supabase
        .from("notifications")
        .select("id, type, title, message, read_at, created_at, link, category")
        .eq("recipient_id", user.id)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (unreadOnly) q = q.is("read_at", null);
      const { data, error } = await q;
      if (error) return { ok: false, content: "Erreur lors de la lecture des notifications." };
      const rows = (data ?? []) as NotificationRow[];
      if (rows.length === 0) return { ok: true, content: unreadOnly ? "Aucune notification non lue." : "Aucune notification." };
      const lines = rows.map((n) =>
        `- ${n.title}${n.read_at ? "" : " (NON LUE)"} — ${n.message} — ${fmtDate(n.created_at)}`
      );
      return { ok: true, content: `Notifications (${rows.length}, ${rows.filter((n) => !n.read_at).length} non lues) :\n${lines.join("\n")}` };
    }

    case "searchPlatform": {
      const query = String(args.query ?? "").trim().toLowerCase();
      if (query.length < 2) return { ok: true, content: "Requête de recherche trop courte." };
      const [documents, hints, recordings, tasks] = await Promise.all([
        supabase.from("documents").select("title").eq("class_id", classId ?? "").ilike("title", `%${query}%`).limit(10),
        supabase.from("hints").select("title, year").eq("class_id", classId ?? "").ilike("title", `%${query}%`).limit(10),
        supabase.from("recordings").select("title").eq("class_id", classId ?? "").ilike("title", `%${query}%`).limit(10),
        supabase.from("tasks").select("title").eq("class_id", classId ?? "").ilike("title", `%${query}%`).limit(10),
      ]);
      const lines: string[] = [];
      (documents.data ?? []).forEach((d) => lines.push(`Document : ${d.title}`));
      (hints.data ?? []).forEach((h) => lines.push(`Hint : ${h.title}${h.year ? ` (${h.year})` : ""}`));
      (recordings.data ?? []).forEach((r) => lines.push(`Cours enregistré : ${r.title}`));
      (tasks.data ?? []).forEach((t) => lines.push(`Devoir : ${t.title}`));
      if (lines.length === 0) return { ok: true, content: `Aucune ressource trouvée pour « ${query} ».` };
      return { ok: true, content: `Résultats pour « ${query} » :\n${lines.join("\n")}` };
    }

    case "suggestActions": {
      const actions = sanitizeAssistantActions(args.actions);
      return { ok: true, content: "Actions validées.", actions };
    }

    default:
      return { ok: false, content: `Outil inconnu : ${name}` };
  }
}
