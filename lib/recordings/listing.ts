/**
 * Logique d'affichage de la bibliothèque « Cours enregistrés » (fonctions pures).
 *
 * Données disponibles dans `recordings` (modèle inchangé) :
 *  - `title`, `description` : champs texte de la séance ;
 *  - `date` (colonne DATE « YYYY-MM-DD ») : date de la séance enregistrée —
 *    c'est LA date d'enregistrement fiable, celle affichée sur la carte et
 *    utilisée par l'ordre par défaut de la page ;
 *  - `created_at` : horodatage de publication en base, servant uniquement de
 *    départage (jamais confondu avec `date`) ;
 *  - `subject_id` → nom de la matière (mappeage applicatif sur `subjects`,
 *    convention du projet : pas de jointure PostgREST).
 *
 * La recherche est 100 % locale (aucune requête Supabase par frappe) : la page
 * charge déjà toute la bibliothèque de la classe, filtrée par RLS côté serveur.
 */

export interface RecordingListItem {
  id: string;
  title: string;
  description: string | null;
  /** Date de la séance enregistrée, ISO « YYYY-MM-DD ». */
  date: string;
  /** Horodatage de publication en base, ISO 8601. */
  createdAt: string;
  driveUrl: string;
  /** Nom de la matière associée, null si indisponible. */
  subjectName: string | null;
}

/* ────────────────────────────── Tri ────────────────────────────── */

export const RECORDING_SORT_OPTIONS = [
  { value: "date_desc", label: "Plus récents" },
  { value: "date_asc", label: "Plus anciens" },
  { value: "title_asc", label: "Titre : A → Z" },
  { value: "title_desc", label: "Titre : Z → A" },
] as const;

export type RecordingSortKey = (typeof RECORDING_SORT_OPTIONS)[number]["value"];

export const DEFAULT_RECORDING_SORT: RecordingSortKey = "date_desc";

export function isRecordingSortKey(value: unknown): value is RecordingSortKey {
  return (
    typeof value === "string" &&
    RECORDING_SORT_OPTIONS.some((option) => option.value === value)
  );
}

function compareIds(a: RecordingListItem, b: RecordingListItem): number {
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

/** Date de séance croissante, puis publication croissante, puis identifiant. */
function compareDateAsc(a: RecordingListItem, b: RecordingListItem): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  return compareIds(a, b);
}

/** Date de séance décroissante, puis publication décroissante, puis identifiant. */
function compareDateDesc(a: RecordingListItem, b: RecordingListItem): number {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
  return compareIds(a, b);
}

/**
 * Comparaison alphabétique « naturelle » : insensible à la casse et aux
 * accents (« Algorithme », « ALGORITHME » et « algorithme » sont égaux).
 * L'égalité est ensuite départagée par la date de séance puis l'identifiant
 * (voir `compareTitleAsc` / `compareTitleReverse`) : l'ordre reste total.
 */
function compareTitles(a: RecordingListItem, b: RecordingListItem): number {
  return a.title.localeCompare(b.title, "fr", { sensitivity: "base" });
}

/** Titres égaux : départage stable (date de séance décroissante, puis id). */
function compareTitleDesc(a: RecordingListItem, b: RecordingListItem): number {
  return compareDateDesc(a, b);
}

function compareTitleAsc(a: RecordingListItem, b: RecordingListItem): number {
  const byTitle = compareTitles(a, b);
  if (byTitle !== 0) return byTitle;
  return compareTitleDesc(a, b);
}

function compareTitleReverse(a: RecordingListItem, b: RecordingListItem): number {
  const byTitle = compareTitles(a, b);
  if (byTitle !== 0) return -byTitle;
  return compareTitleDesc(a, b);
}

/**
 * Tri déterministe : l'ordre est total (départage systématique), donc deux
 * exécutions sur les mêmes données rendent exactement le même classement,
 * y compris en cas d'égalité de date ou de titre.
 */
export function sortRecordings(
  recordings: RecordingListItem[],
  sort: RecordingSortKey = DEFAULT_RECORDING_SORT
): RecordingListItem[] {
  const sorted = [...recordings];
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

/**
 * Normalisation insensible à la casse et aux accents :
 *  - casse réduite, apostrophes transformées en espaces (« d'algorithme ») ;
 *  - décomposition NFD + suppression des combinantes (é, è, à, ç…) ;
 *  - ligatures courantes du français (œ, æ) et ß développés.
 */
export function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/['‘’ʼ`´]/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .replace(/ß/g, "ss")
    .replace(/\s+/g, " ")
    .trim();
}

/** Champs réellement recherchables : titre, matière, description. */
export function recordingSearchText(recording: RecordingListItem): string {
  return [recording.title, recording.subjectName ?? "", recording.description ?? ""]
    .filter(Boolean)
    .join(" ");
}

/** Racine commune minimale pour une correspondance « approchée » (≥ 8) :
 *  « algorithme » retrouve « Algorithmique », mais « complet » ne ratisse pas
 *  « complexité ». En deçà, seule la sous-chaîne exacte compte. */
const MIN_ROOT = 8;

/** Vrai si le mot et le mot-clé partagent une racine significative. */
function sharesRoot(word: string, token: string): boolean {
  if (word.length < MIN_ROOT || token.length < MIN_ROOT) return false;
  const max = Math.min(word.length, token.length);
  let i = 0;
  while (i < max && word[i] === token[i]) i += 1;
  return i >= MIN_ROOT;
}

/**
 * Tous les mots de la recherche doivent apparaître (insensibles à la casse et
 * aux accents), répartis sur les champs titre / matière / description.
 * Une recherche vide correspond toujours au cours.
 *
 * Tolérance de racine limitée : « algorithme » retrouve « Algorithmique »
 * (racine commune ≥ 8 caractères, jamais pour des mots courts). Le préfixe
 * seul suffit déjà grâce à la recherche par sous-chaîne (« algo » →
 * « Algorithmique »).
 */
export function matchesRecordingQuery(
  recording: RecordingListItem,
  normalizedQuery: string
): boolean {
  if (!normalizedQuery) return true;
  const haystack = normalizeSearchText(recordingSearchText(recording));
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
export function filterRecordings(
  recordings: RecordingListItem[],
  query: string
): RecordingListItem[] {
  const normalized = normalizeSearchText(query ?? "");
  if (!normalized) return recordings;
  return recordings.filter((recording) => matchesRecordingQuery(recording, normalized));
}

/** Recherche + tri combinés (le tri indépendant de la recherche). */
export function applyRecordingLibrary(
  recordings: RecordingListItem[],
  query: string,
  sort: RecordingSortKey = DEFAULT_RECORDING_SORT
): RecordingListItem[] {
  return sortRecordings(filterRecordings(recordings, query), sort);
}

/* ──────────────────────────── États UI ──────────────────────────── */

export type RecordingLibraryState = "empty" | "no-results" | "results";

/**
 *  - `empty`      : la bibliothèque elle-même est vide (jamais présenté comme
 *                   un échec de recherche) ;
 *  - `no-results` : la bibliothèque contient des cours mais aucun ne correspond ;
 *  - `results`    : au moins un cours correspond.
 */
export function resolveRecordingLibraryState(
  total: number,
  visibleCount: number
): RecordingLibraryState {
  if (total <= 0) return "empty";
  if (visibleCount <= 0) return "no-results";
  return "results";
}

/** Compteur affiché : total seul sans recherche, « X sur Y » avec recherche. */
export function formatRecordingCount(
  visibleCount: number,
  total: number,
  hasQuery: boolean
): string {
  if (hasQuery) return `${visibleCount} sur ${total} résultat(s)`;
  return `${total} enregistrement(s)`;
}
