/**
 * Logique d'affichage du module « Documents » (fonctions pures).
 *
 * Données réellement disponibles dans `documents` (modèle inchangé) :
 *  - `title`, `description` (nullable) : seuls champs texte du document ;
 *  - `created_at` : horodatage de dépôt en base — LA seule date fiable du
 *    module (aucune date de publication distincte n'existe) : elle sert de
 *    tri chronologique et de départage ;
 *  - `subject_id` → nom de la matière (mappeage applicatif sur `subjects`,
 *    convention du projet : pas de jointure PostgREST).
 *  Aucun champ type / catégorie n'existe en base : la recherche porte donc
 *  sur titre, matière et description uniquement.
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

export interface DocumentListItem {
  id: string;
  title: string;
  description: string | null;
  /** Horodatage de dépôt en base, ISO 8601. */
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

export const DOCUMENT_SORT_OPTIONS = [
  { value: "date_desc", label: "Plus récents" },
  { value: "date_asc", label: "Plus anciens" },
  { value: "title_asc", label: "Titre : A → Z" },
  { value: "title_desc", label: "Titre : Z → A" },
] as const;

export type DocumentSortKey = (typeof DOCUMENT_SORT_OPTIONS)[number]["value"];

export const DEFAULT_DOCUMENT_SORT: DocumentSortKey = "date_desc";

export function isDocumentSortKey(value: unknown): value is DocumentSortKey {
  return (
    typeof value === "string" &&
    DOCUMENT_SORT_OPTIONS.some((option) => option.value === value)
  );
}

function compareIds(a: DocumentListItem, b: DocumentListItem): number {
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

/** Dépôt croissant, puis identifiant. */
function compareDateAsc(a: DocumentListItem, b: DocumentListItem): number {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  return compareIds(a, b);
}

/** Dépôt décroissant, puis identifiant. */
function compareDateDesc(a: DocumentListItem, b: DocumentListItem): number {
  if (a.createdAt !== b.createdAt) return a.createdAt > b.createdAt ? -1 : 1;
  return compareIds(a, b);
}

/**
 * Comparaison alphabétique « naturelle » : insensible à la casse et aux
 * accents (« Algorithmique », « ALGORITHMIQUE » et « algorithmique » sont
 * égaux). L'égalité est ensuite départagée par la date de dépôt puis
 * l'identifiant (voir `compareTitleAsc` / `compareTitleReverse`) : l'ordre
 * reste total.
 */
function compareTitles(a: DocumentListItem, b: DocumentListItem): number {
  return a.title.localeCompare(b.title, "fr", { sensitivity: "base" });
}

/** Titres égaux : départage stable (dépôt décroissant, puis id). */
function compareTitleDesc(a: DocumentListItem, b: DocumentListItem): number {
  return compareDateDesc(a, b);
}

function compareTitleAsc(a: DocumentListItem, b: DocumentListItem): number {
  const byTitle = compareTitles(a, b);
  if (byTitle !== 0) return byTitle;
  return compareTitleDesc(a, b);
}

function compareTitleReverse(a: DocumentListItem, b: DocumentListItem): number {
  const byTitle = compareTitles(a, b);
  if (byTitle !== 0) return -byTitle;
  return compareTitleDesc(a, b);
}

/**
 * Tri déterministe : l'ordre est total (départage systématique), donc deux
 * exécutions sur les mêmes données rendent exactement le même classement,
 * y compris en cas d'égalité de date ou de titre.
 */
export function sortDocuments(
  documents: DocumentListItem[],
  sort: DocumentSortKey = DEFAULT_DOCUMENT_SORT
): DocumentListItem[] {
  const sorted = [...documents];
  switch (sort) {
    case "date_asc":
      sorted.sort(compareDateAsc);
      break;
    case "title_asc":
      sorted.sort(compareTitleAsc);
      break;
    case "title_desc":
      sorted.sort(compareTitleReverse);
      break;
    case "date_desc":
    default:
      sorted.sort(compareDateDesc);
  }
  return sorted;
}

/* ───────────────────────────── Recherche ───────────────────────────── */

/** Champs réellement recherchables : titre, matière, description. */
export function documentSearchText(document: DocumentListItem): string {
  return [document.title, document.subjectName ?? "", document.description ?? ""]
    .filter(Boolean)
    .join(" ");
}

/**
 * Tous les mots de la recherche doivent apparaître (insensibles à la casse et
 * aux accents), répartis sur les champs titre / matière / description.
 * Une recherche vide correspond toujours au document.
 *
 * Tolérance de racine identique à « Cours enregistrés » (racine commune
 * ≥ 8 caractères, jamais pour des mots courts) : « algorithme » retrouve
 * « Algorithmique », mais « complet » ne ratisse pas « complexité ».
 */
export function matchesDocumentQuery(
  document: DocumentListItem,
  normalizedQuery: string
): boolean {
  if (!normalizedQuery) return true;
  const haystack = normalizeSearchText(documentSearchText(document));
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
export function filterDocuments(
  documents: DocumentListItem[],
  query: string
): DocumentListItem[] {
  const normalized = normalizeSearchText(query ?? "");
  if (!normalized) return documents;
  return documents.filter((document) => matchesDocumentQuery(document, normalized));
}

/** Recherche + tri combinés (le tri est indépendant de la recherche). */
export function applyDocumentLibrary(
  documents: DocumentListItem[],
  query: string,
  sort: DocumentSortKey = DEFAULT_DOCUMENT_SORT
): DocumentListItem[] {
  return sortDocuments(filterDocuments(documents, query), sort);
}

/* ──────────────────────────── États UI ──────────────────────────── */

export type DocumentLibraryState = "empty" | "no-results" | "results";

/**
 *  - `empty`      : la bibliothèque elle-même est vide (jamais présentée comme
 *                   un échec de recherche) ;
 *  - `no-results` : la bibliothèque contient des documents mais aucun ne
 *                   correspond à la recherche ;
 *  - `results`    : au moins un document correspond.
 */
export function resolveDocumentLibraryState(
  total: number,
  visibleCount: number
): DocumentLibraryState {
  if (total <= 0) return "empty";
  if (visibleCount <= 0) return "no-results";
  return "results";
}

/** Compteur affiché : total seul sans recherche, « X sur Y » avec recherche. */
export function formatDocumentCount(
  visibleCount: number,
  total: number,
  hasQuery: boolean
): string {
  if (hasQuery) return `${visibleCount} sur ${total} résultat(s)`;
  return `${total} document(s)`;
}
