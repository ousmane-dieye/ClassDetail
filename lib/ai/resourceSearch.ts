/**
 * Recherche de ressources pour l'assistant IA (ClassPulse).
 *
 * TROIS catégories = TROIS tables distinctes du schéma (ce ne sont pas des
 * catégories d'une même entité) :
 *  - `documents`  : supports, cours, TD, TP, PDF (module Documents) ;
 *  - `hints`      : sujets d'examen, devoirs, annales, corrigés (Hints & Sujets) ;
 *  - `recordings` : cours enregistrés (module Cours enregistrés).
 * `evaluation_documents` / `evaluation_hints` sont des tables de liaison vers
 * `evaluations` : les entités restent `documents` et `hints`, déjà couvertes.
 *
 * SÉCURITÉ / RLS :
 *  - La recherche s'exécute côté serveur avec LE CLIENT DE L'UTILISATEUR
 *    (cookies de session) + le filtre explicite `class_id` de l'utilisateur.
 *    Les policies `is_member_of(class_id)` font foi : aucun autre périmètre,
 *    aucune autre classe, aucune bibliothèque personnelle d'un tiers.
 *  - Aucun identifiant de ressource n'est accepté en entrée : seul le texte de
 *    recherche de l'utilisateur est utilisé. Le modèle ne peut donc pas fabriquer
 *    un accès en connaissant un UUID.
 *  - Le service role n'est JAMAIS utilisé ici.
 *
 * CLASSEMENT : 100 % déterministe (score → date de publication → id), testé
 * dans tests/assistantResourceSearch.test.ts. Aucune dépendance externe.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { normalizeSearchText, sharesRoot } from "@/lib/recordings/listing";

export type ResourceCategory = "documents" | "hints" | "recordings";

/** Résultat de recherche prêt à être présenté à l'utilisateur. */
export interface ResourceHit {
  id: string;
  category: ResourceCategory;
  /** Titre RÉEL de la ressource (jamais reconstitué). */
  title: string;
  /** Type lisible : hint_type traduit, ou libellé de catégorie. */
  type: string;
  subject: string | null;
  description: string | null;
  /** Détail complémentaire : promotion (hints) ou date de séance (recordings). */
  detail: string | null;
  /** URL réelle du fichier (colonne `drive_url`, validée en écriture). */
  url: string;
  /** Page interne du module où vit la ressource (liste blanche). */
  moduleHref: string;
  /** Horodatage de publication (départage du classement). */
  createdAt: string;
}

/** Nombre maximal de résultats présentés à l'utilisateur. */
export const MAX_SEARCH_RESULTS = 5;
/** Nombre maximal d'alternatives proposées quand la recherche stricte est vide. */
export const MAX_ALTERNATIVES = 3;
/** Plafond de lignes analysées par catégorie (une bibliothèque de classe). */
const MAX_SCAN_ROWS = 200;
const MAX_DESCRIPTION = 160;

interface CategoryConfig {
  table: "documents" | "hints" | "recordings";
  moduleHref: string;
  moduleLabel: string;
  /** Message de « aucun résultat » (repris tel quel par l'assistant). */
  emptyMessage: string;
}

export const RESOURCE_CATEGORIES: Record<ResourceCategory, CategoryConfig> = {
  documents: {
    table: "documents",
    moduleHref: "/dashboard/documents",
    moduleLabel: "Documents",
    emptyMessage:
      "Je n'ai pas trouvé de ressource correspondant à ta recherche dans les documents auxquels tu as accès. Tu peux essayer avec un autre titre ou une autre matière.",
  },
  hints: {
    table: "hints",
    moduleHref: "/dashboard/hints",
    moduleLabel: "Hints & Sujets",
    emptyMessage:
      "Je n'ai pas trouvé de ressource correspondant à ta recherche dans les sujets, devoirs et annales auxquels tu as accès. Tu peux essayer avec un autre titre ou une autre matière.",
  },
  recordings: {
    table: "recordings",
    moduleHref: "/dashboard/recordings",
    moduleLabel: "Cours enregistrés",
    emptyMessage:
      "Je n'ai pas trouvé de ressource correspondant à ta recherche dans les cours enregistrés auxquels tu as accès. Tu peux essayer avec un autre titre ou une autre matière.",
  },
};

/** Traduction de l'enum `hint_type` (schéma Supabase). */
const HINT_TYPE_LABELS: Record<string, string> = {
  DEVOIR: "Devoir",
  EXAMEN: "Examen",
  CONTROLE: "Contrôle",
  TP: "TP",
  PROJET: "Projet",
  AUTRE: "Autre",
};

/** Ligne brute telle que lue en base (colonnes réellement sélectionnées). */
interface RawRow {
  id: string;
  title: string;
  subject_id: string;
  created_at: string;
  drive_url: string;
  description?: string | null;
  year?: string | null;
  type?: string | null;
  date?: string | null;
}

type ServerClient = SupabaseClient<Database>;

/* ───────────────────────────── Classement ───────────────────────────── */

function truncate(value: string, max: number): string {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
}

function formatDateFr(isoDate: string): string | null {
  if (!isoDate) return null;
  const d = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

/** Vrai si un mot-clé (normalisé) correspond à un mot du texte. */
function tokenMatches(haystack: string, words: string[], token: string): boolean {
  // Mot d'un seul caractère (« C », « R ») : égalité de mot exacte uniquement,
  // sinon « c » matcherait n'importe quel texte contenant la lettre c.
  if (token.length === 1) return words.includes(token);
  return haystack.includes(token) || words.some((word) => sharesRoot(word, token));
}

function splitWords(haystack: string): string[] {
  return haystack.split(/[^a-z0-9]+/).filter(Boolean);
}

/** Score d'une ressource pour une requête normalisée (0 = non pertinent). */
export function scoreResourceHit(hit: ResourceHit, normalizedQuery: string, relaxed = false): number {
  if (!normalizedQuery) return 0;
  const title = normalizeSearchText(hit.title);
  const subject = normalizeSearchText(hit.subject ?? "");
  const description = normalizeSearchText(hit.description ?? "");
  const type = normalizeSearchText(hit.type);
  const detail = normalizeSearchText(hit.detail ?? "");
  const haystack = [title, subject, description, type, detail].filter(Boolean).join(" ");
  if (!haystack) return 0;

  const words = splitWords(haystack);
  const tokens = normalizedQuery.split(" ").filter(Boolean);
  if (tokens.length === 0) return 0;

  const matched = relaxed
    ? tokens.some((token) => tokenMatches(haystack, words, token))
    : tokens.every((token) => tokenMatches(haystack, words, token));
  if (!matched) return 0;

  let score = 0;
  if (title === normalizedQuery) score += 100;
  if (subject === normalizedQuery) score += 70;
  if (title.includes(normalizedQuery)) score += 50;
  if (subject.includes(normalizedQuery)) score += 35;
  if (description.includes(normalizedQuery)) score += 15;
  if (tokens.every((token) => title.includes(token))) score += 25;
  if (tokens.every((token) => subject.includes(token))) score += 15;

  for (const token of tokens) {
    if (title.includes(token)) score += 6;
    else if (subject.includes(token)) score += 4;
    else if (description.includes(token)) score += 2;
    else score += 1;
  }
  return score;
}

/**
 * Classe, dédoublonne et limite les résultats.
 * - correspondance stricte par défaut (TOUS les mots-clés doivent matcher) ;
 * - `relaxed` : au moins un mot-clé (utilisé uniquement pour les alternatives) ;
 * - tri : score décroissant, puis publication la plus récente, puis id.
 */
export function rankResourceHits(
  hits: ResourceHit[],
  normalizedQuery: string,
  options: { limit?: number; relaxed?: boolean } = {}
): ResourceHit[] {
  const limit = options.limit ?? MAX_SEARCH_RESULTS;
  const relaxed = options.relaxed === true;

  const scored = hits
    .map((hit) => ({ hit, score: scoreResourceHit(hit, normalizedQuery, relaxed) }))
    .filter((entry) => entry.score > 0);

  scored.sort(
    (a, b) =>
      b.score - a.score ||
      b.hit.createdAt.localeCompare(a.hit.createdAt) ||
      a.hit.id.localeCompare(b.hit.id)
  );

  const seen = new Set<string>();
  const out: ResourceHit[] = [];
  for (const { hit } of scored) {
    const key = `${normalizeSearchText(hit.title)}|${normalizeSearchText(hit.subject ?? "")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(hit);
    if (out.length >= limit) break;
  }
  return out;
}

/* ───────────────────────────── Lecture base ───────────────────────────── */

async function fetchRows(
  client: ServerClient,
  category: ResourceCategory,
  classId: string
): Promise<{ data: RawRow[] | null; error: { message: string } | null }> {
  let res: { data: unknown; error: { message: string } | null };

  if (category === "documents") {
    res = await client
      .from("documents")
      .select("id, title, description, subject_id, created_at, drive_url")
      .eq("class_id", classId)
      .order("created_at", { ascending: false })
      .limit(MAX_SCAN_ROWS);
  } else if (category === "hints") {
    res = await client
      .from("hints")
      .select("id, title, type, year, subject_id, drive_url, created_at")
      .eq("class_id", classId)
      .order("created_at", { ascending: false })
      .limit(MAX_SCAN_ROWS);
  } else {
    res = await client
      .from("recordings")
      .select("id, title, description, date, subject_id, drive_url, created_at")
      .eq("class_id", classId)
      .order("created_at", { ascending: false })
      .limit(MAX_SCAN_ROWS);
  }

  return { data: (res.data ?? []) as RawRow[], error: res.error };
}

function toHit(row: RawRow, category: ResourceCategory, subject: string | null): ResourceHit {
  const cfg = RESOURCE_CATEGORIES[category];
  let type = "Document";
  let detail: string | null = null;

  if (category === "hints") {
    type = HINT_TYPE_LABELS[row.type ?? "AUTRE"] ?? "Autre";
    detail = row.year ? `Promotion ${row.year}` : null;
  } else if (category === "recordings") {
    type = "Cours enregistré";
    detail = row.date ? formatDateFr(row.date) : null;
  }

  return {
    id: row.id,
    category,
    title: row.title,
    type,
    subject,
    description: row.description ? truncate(row.description, MAX_DESCRIPTION) : null,
    detail,
    url: row.drive_url,
    moduleHref: cfg.moduleHref,
    createdAt: row.created_at,
  };
}

export interface ResourceSearchOutcome {
  ok: boolean;
  results: ResourceHit[];
  alternatives: ResourceHit[];
}

/**
 * Recherche dans une catégorie, strictement dans la classe de l'utilisateur.
 * Si la recherche stricte est vide, des « alternatives proches » (au moins un
 * mot-clé correspondant) sont retournées — à présenter explicitement comme telles.
 */
export async function searchResources(input: {
  client: ServerClient;
  classId: string | null;
  category: ResourceCategory;
  query: string;
  limit?: number;
}): Promise<ResourceSearchOutcome> {
  const normalized = normalizeSearchText(input.query);
  if (!normalized) return { ok: true, results: [], alternatives: [] };

  const classId = input.classId ?? "";
  // Utilisateur sans classe (compte en attente d'inscription) : aucune ressource
  // accessible — aucune requête n'est même exécutée.
  if (!classId) return { ok: true, results: [], alternatives: [] };

  const [subjectsRes, rowsRes] = await Promise.all([
    input.client.from("subjects").select("id, name").eq("class_id", classId),
    fetchRows(input.client, input.category, classId),
  ]);

  if (subjectsRes.error || rowsRes.error) {
    return { ok: false, results: [], alternatives: [] };
  }

  const subjectNames = new Map((subjectsRes.data ?? []).map((s) => [s.id, s.name]));
  const hits = (rowsRes.data ?? []).map((row) =>
    toHit(row, input.category, subjectNames.get(row.subject_id) ?? null)
  );

  const results = rankResourceHits(hits, normalized, { limit: input.limit });
  const alternatives =
    results.length > 0
      ? []
      : rankResourceHits(hits, normalized, { limit: MAX_ALTERNATIVES, relaxed: true });

  return { ok: true, results, alternatives };
}

/* ───────────────────────── Format pour le modèle ───────────────────────── */

function formatHitLine(hit: ResourceHit, index: number): string {
  const cfg = RESOURCE_CATEGORIES[hit.category];
  // Titre cliquable → fichier réel ; lien secondaire → page interne du module.
  const parts = [`${index}. [**${hit.title}**](${hit.url})`, `type : ${hit.type}`];
  if (hit.subject) parts.push(`matière : ${hit.subject}`);
  if (hit.detail) parts.push(hit.detail);
  if (hit.description) parts.push(`description : ${hit.description}`);
  parts.push(`[Voir dans ${cfg.moduleLabel}](${cfg.moduleHref})`);
  return parts.join(" — ");
}

/**
 * Format transmis au modèle : résultats classés + URL RÉELLES à recopier.
 * Le modèle ne fabrique ni titre, ni matière, ni lien : il recopie.
 */
export function formatResourceResults(input: {
  category: ResourceCategory;
  query: string;
  results: ResourceHit[];
  alternatives: ResourceHit[];
}): string {
  const cfg = RESOURCE_CATEGORIES[input.category];
  const lines: string[] = [];

  if (input.results.length === 0) {
    lines.push(`Recherche « ${input.query} » dans ${cfg.moduleLabel} : AUCUN résultat.`);
    lines.push(`Message à reprendre tel quel dans ta réponse : « ${cfg.emptyMessage} »`);
    if (input.alternatives.length > 0) {
      lines.push(
        "",
        "Alternatives proches (à présenter UNIQUEMENT comme alternatives, jamais comme résultat direct) :"
      );
      input.alternatives.forEach((hit, index) => lines.push(formatHitLine(hit, index + 1)));
    } else {
      lines.push("Aucune alternative proche.");
    }
    return lines.join("\n");
  }

  lines.push(
    `Recherche « ${input.query} » dans ${cfg.moduleLabel} : ${input.results.length} résultat(s).`
  );
  input.results.forEach((hit, index) => lines.push(formatHitLine(hit, index + 1)));
  lines.push(
    "",
    `Recopie ces URL EXACTEMENT telles quelles dans ta réponse markdown : n'invente jamais de titre, de matière ou de lien. Présente au plus ${MAX_SEARCH_RESULTS} ressources, les plus pertinentes d'abord.`
  );
  return lines.join("\n");
}
