/**
 * Logique d'affichage du module « Hints & Sujets » (fonctions pures).
 *
 * Données réellement disponibles dans `hints` (modèle inchangé) :
 *  - `title` : titre du sujet / corrigé ;
 *  - `type` : enum `hint_type` (DEVOIR, EXAMEN, CONTROLE, TP, PROJET, AUTRE)
 *    — c'est LA catégorie de ressource du module, elle est recherchable ;
 *  - `year` : année académique / promotion, texte « YYYY-YYYY » (not null) —
 *    c'est LA date « contenu » du module (les annales sont classées par
 *    promotion, comme l'ordre serveur historique `year desc`), elle sert de
 *    tri chronologique et de recherche ;
 *  - `created_at` : horodatage d'ajout en base, servant uniquement de
 *    départage (jamais confondu avec `year`) ;
 *  - `subject_id` → nom de la matière (mappeage applicatif sur `subjects`,
 *    convention du projet : pas de jointure PostgREST).
 *  Aucun champ description n'existe en base : la recherche porte sur titre,
 *  matière, type et année de promotion.
 *
 * La recherche est 100 % locale (aucune requête Supabase par frappe) : la page
 * charge déjà toute la bibliothèque de la classe, filtrée par RLS côté serveur.
 *
 * La normalisation (casse / accents) et la tolérance de racine sont CELLES de
 * « Cours enregistrés » (importées depuis `lib/recordings/listing`, même
 * convention que `lib/ai/resourceSearch.ts`) : un seul comportement de
 * recherche dans toute l'application.
 */

import { normalizeSearchText, sharesRoot } from "@/lib/recordings/listing";

export interface HintListItem {
  id: string;
  title: string;
  /** Année académique / promotion du sujet, texte « YYYY-YYYY ». */
  year: string;
  /** Valeur de l'enum `hint_type` (ex : EXAMEN, DEVOIR, TP…). */
  type: string;
  /** Horodatage d'ajout en base, ISO 8601 (départage uniquement). */
  createdAt: string;
  driveUrl: string;
  /** Nom de la matière associée, null si indisponible. */
  subjectName: string | null;
  /**
   * Autorisation de suppression pré-calculée côté serveur avec la matrice
   * inchangée (`canDeleteResource`) : le client n'infère jamais une permission.
   */
  canDelete: boolean;
}

/* ────────────────────────────── Tri ────────────────────────────── */

/**
 * Les critères reprennent les 4 libellés de « Cours enregistrés ».
 * Le critère chronologique porte sur `year` (année de promotion, la donnée
 * fiable et affichée du module — cohérent avec l'ordre serveur historique
 * `order("year", { ascending: false })`), `created_at` servant seulement de
 * départage.
 */
export const HINT_SORT_OPTIONS = [
  { value: "date_desc", label: "Plus récents" },
  { value: "date_asc", label: "Plus anciens" },
  { value: "title_asc", label: "Titre : A → Z" },
  { value: "title_desc", label: "Titre : Z → A" },
] as const;

export type HintSortKey = (typeof HINT_SORT_OPTIONS)[number]["value"];

export const DEFAULT_HINT_SORT: HintSortKey = "date_desc";

export function isHintSortKey(value: unknown): value is HintSortKey {
  return (
    typeof value === "string" &&
    HINT_SORT_OPTIONS.some((option) => option.value === value)
  );
}

function compareIds(a: HintListItem, b: HintListItem): number {
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

/** Année de promotion croissante, puis ajout croissant, puis identifiant. */
function compareYearAsc(a: HintListItem, b: HintListItem): number {
  if (a.year !== b.year) return a.year < b.year ? -1 : 1;
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  return compareIds(a, b);
}

/** Année de promotion décroissante, puis ajout décroissant, puis identifiant. */
function compareYearDesc(a: HintListItem, b: HintListItem): number {
  if (a.year !== b.year) return a.year > b.year ? -1 : 1;
  if (a.createdAt !== b.createdAt) return a.createdAt > b.createdAt ? -1 : 1;
  return compareIds(a, b);
}

/**
 * Comparaison alphabétique « naturelle » : insensible à la casse et aux
 * accents (« Systèmes », « SYSTÈMES » et « systèmes » sont égaux).
 * L'égalité est ensuite départagée par la promotion la plus récente puis
 * l'identifiant : l'ordre reste total.
 */
function compareTitles(a: HintListItem, b: HintListItem): number {
  return a.title.localeCompare(b.title, "fr", { sensitivity: "base" });
}

/** Titres égaux : départage stable (promotion décroissante, puis id). */
function compareTitleDesc(a: HintListItem, b: HintListItem): number {
  return compareYearDesc(a, b);
}

function compareTitleAsc(a: HintListItem, b: HintListItem): number {
  const byTitle = compareTitles(a, b);
  if (byTitle !== 0) return byTitle;
  return compareTitleDesc(a, b);
}

function compareTitleReverse(a: HintListItem, b: HintListItem): number {
  const byTitle = compareTitles(a, b);
  if (byTitle !== 0) return -byTitle;
  return compareTitleDesc(a, b);
}

/**
 * Tri déterministe : l'ordre est total (départage systématique), donc deux
 * exécutions sur les mêmes données rendent exactement le même classement,
 * y compris en cas d'égalité d'année ou de titre.
 */
export function sortHints(
  hints: HintListItem[],
  sort: HintSortKey = DEFAULT_HINT_SORT
): HintListItem[] {
  const sorted = [...hints];
  switch (sort) {
    case "date_asc":
      sorted.sort(compareYearAsc);
      break;
    case "title_asc":
      sorted.sort(compareTitleAsc);
      break;
    case "title_desc":
      sorted.sort(compareTitleReverse);
      break;
    case "date_desc":
    default:
      sorted.sort(compareYearDesc);
  }
  return sorted;
}

/* ───────────────────────────── Recherche ───────────────────────────── */

/**
 * Champs réellement recherchables : titre, matière, type de ressource
 * (enum `hint_type`, normalisé : « examen » retrouve « EXAMEN »,
 * « controle » retrouve « CONTROLE ») et année de promotion (« 2025 »
 * retrouve « 2024-2025 »).
 */
export function hintSearchText(hint: HintListItem): string {
  return [hint.title, hint.subjectName ?? "", hint.type, hint.year]
    .filter(Boolean)
    .join(" ");
}

/**
 * Tous les mots de la recherche doivent apparaître (insensibles à la casse et
 * aux accents), répartis sur les champs titre / matière / type / promotion.
 * Une recherche vide correspond toujours au hint.
 *
 * Tolérance de racine identique à « Cours enregistrés » (racine commune
 * ≥ 8 caractères, jamais pour des mots courts).
 */
export function matchesHintQuery(
  hint: HintListItem,
  normalizedQuery: string
): boolean {
  if (!normalizedQuery) return true;
  const haystack = normalizeSearchText(hintSearchText(hint));
  if (!haystack) return false;
  const words = haystack.split(" ");
  const tokens = normalizedQuery.split(" ").filter(Boolean);
  return (
    tokens.length > 0 &&
    tokens.every(
      (token) =>
        haystack.includes(token) || words.some((word) => sharesRoot(word, token))
    )
  );
}

/** Filtre la bibliothèque. Recherche vide (ou blanche) → liste inchangée. */
export function filterHints(
  hints: HintListItem[],
  query: string
): HintListItem[] {
  const normalized = normalizeSearchText(query ?? "");
  if (!normalized) return hints;
  return hints.filter((hint) => matchesHintQuery(hint, normalized));
}

/** Recherche + tri combinés (le tri est indépendant de la recherche). */
export function applyHintLibrary(
  hints: HintListItem[],
  query: string,
  sort: HintSortKey = DEFAULT_HINT_SORT
): HintListItem[] {
  return sortHints(filterHints(hints, query), sort);
}

/* ──────────────────────────── États UI ──────────────────────────── */

export type HintLibraryState = "empty" | "no-results" | "results";

/**
 *  - `empty`      : la bibliothèque elle-même est vide (jamais présentée comme
 *                   un échec de recherche) ;
 *  - `no-results` : la bibliothèque contient des sujets mais aucun ne
 *                   correspond à la recherche ;
 *  - `results`    : au moins un sujet correspond.
 */
export function resolveHintLibraryState(
  total: number,
  visibleCount: number
): HintLibraryState {
  if (total <= 0) return "empty";
  if (visibleCount <= 0) return "no-results";
  return "results";
}

/** Compteur affiché : total seul sans recherche, « X sur Y » avec recherche. */
export function formatHintCount(
  visibleCount: number,
  total: number,
  hasQuery: boolean
): string {
  if (hasQuery) return `${visibleCount} sur ${total} résultat(s)`;
  return `${total} sujet(s)`;
}
