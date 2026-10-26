import type { SubjectColorKey } from "@/types/database.types";

/**
 * Palette contrôlée de couleurs de matières.
 *
 * Chaque matière reçoit une clé persistée en base (`subjects.color_key`) et
 * la même couleur est réutilisée partout : calendrier desktop, agenda mobile,
 * formulaires, carte « Aujourd'hui ». La couleur n'est jamais recalculée à
 * partir du nom.
 *
 * Contraste : fond teinté clair + texte foncé (mode clair), fond très sombre
 * + texte clair (mode sombre) — vérifié WCAG AA pour du texte ≥ 12px gras.
 * Une matière n'est jamais identifiable par la couleur seule : le nom et les
 * horaires restent toujours visibles, et un liseré latéral doublé la pastille.
 */

/**
 * Palette de 20 couleurs : une classe peut compter jusqu'à 20 matières avec
 * chacune sa propre couleur (la 21ᵉ boucle modulo 20).
 * Déclarée `as const` (tuple) pour être réutilisée telle quelle par la
 * validation Zod — source unique côté TypeScript, synchronisée avec le CHECK
 * SQL par `tests/schedule-colors.test.ts`.
 */
export const SUBJECT_COLOR_KEYS = [
  "blue",
  "indigo",
  "violet",
  "emerald",
  "teal",
  "amber",
  "rose",
  "red",
  "cyan",
  "orange",
  "purple",
  "yellow",
  "fuchsia",
  "sky",
  "lime",
  "pink",
  "green",
  "slate",
  "stone",
  "gray",
] as const;

export interface SubjectColorStyle {
  key: SubjectColorKey;
  label: string;
  /** Bloc de cours : fond teinté + texte contrasté + bordure (clair/sombre). */
  block: string;
  /** Liseré latéral du bloc et accents ponctuels. */
  accent: string;
  /** Pastille ronde (légende, sélecteur, formulaires). */
  dot: string;
  /** Pastille très sobre pour les listes denses. */
  subtleDot: string;
}

const STYLES: Record<SubjectColorKey, SubjectColorStyle> = {
  blue: {
    key: "blue",
    label: "Bleu",
    block:
      "bg-blue-50 text-blue-950 border-blue-200 dark:bg-blue-950/45 dark:text-blue-100 dark:border-blue-900",
    accent: "bg-blue-500 dark:bg-blue-400",
    dot: "bg-blue-500",
    subtleDot: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  },
  indigo: {
    key: "indigo",
    label: "Indigo",
    block:
      "bg-indigo-50 text-indigo-950 border-indigo-200 dark:bg-indigo-950/45 dark:text-indigo-100 dark:border-indigo-900",
    accent: "bg-indigo-500 dark:bg-indigo-400",
    dot: "bg-indigo-500",
    subtleDot: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300",
  },
  violet: {
    key: "violet",
    label: "Violet",
    block:
      "bg-violet-50 text-violet-950 border-violet-200 dark:bg-violet-950/45 dark:text-violet-100 dark:border-violet-900",
    accent: "bg-violet-500 dark:bg-violet-400",
    dot: "bg-violet-500",
    subtleDot: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  },
  emerald: {
    key: "emerald",
    label: "Émeraude",
    block:
      "bg-emerald-50 text-emerald-950 border-emerald-200 dark:bg-emerald-950/45 dark:text-emerald-100 dark:border-emerald-900",
    accent: "bg-emerald-500 dark:bg-emerald-400",
    dot: "bg-emerald-500",
    subtleDot: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  },
  teal: {
    key: "teal",
    label: "Sarcelle",
    block:
      "bg-teal-50 text-teal-950 border-teal-200 dark:bg-teal-950/45 dark:text-teal-100 dark:border-teal-900",
    accent: "bg-teal-500 dark:bg-teal-400",
    dot: "bg-teal-500",
    subtleDot: "bg-teal-500/15 text-teal-700 dark:text-teal-300",
  },
  amber: {
    key: "amber",
    label: "Ambre",
    block:
      "bg-amber-50 text-amber-950 border-amber-200 dark:bg-amber-950/45 dark:text-amber-100 dark:border-amber-900",
    accent: "bg-amber-500 dark:bg-amber-400",
    dot: "bg-amber-500",
    subtleDot: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  },
  rose: {
    key: "rose",
    label: "Rose",
    block:
      "bg-rose-50 text-rose-950 border-rose-200 dark:bg-rose-950/45 dark:text-rose-100 dark:border-rose-900",
    accent: "bg-rose-500 dark:bg-rose-400",
    dot: "bg-rose-500",
    subtleDot: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  },
  red: {
    key: "red",
    label: "Rouge",
    block:
      "bg-red-50 text-red-950 border-red-200 dark:bg-red-950/45 dark:text-red-100 dark:border-red-900",
    accent: "bg-red-500 dark:bg-red-400",
    dot: "bg-red-500",
    subtleDot: "bg-red-500/15 text-red-700 dark:text-red-300",
  },
  cyan: {
    key: "cyan",
    label: "Cyan",
    block:
      "bg-cyan-50 text-cyan-950 border-cyan-200 dark:bg-cyan-950/45 dark:text-cyan-100 dark:border-cyan-900",
    accent: "bg-cyan-500 dark:bg-cyan-400",
    dot: "bg-cyan-500",
    subtleDot: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300",
  },
  orange: {
    key: "orange",
    label: "Orange",
    block:
      "bg-orange-50 text-orange-950 border-orange-200 dark:bg-orange-950/45 dark:text-orange-100 dark:border-orange-900",
    accent: "bg-orange-500 dark:bg-orange-400",
    dot: "bg-orange-500",
    subtleDot: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  },
  purple: {
    key: "purple",
    label: "Pourpre",
    block:
      "bg-purple-50 text-purple-950 border-purple-200 dark:bg-purple-950/45 dark:text-purple-100 dark:border-purple-900",
    accent: "bg-purple-500 dark:bg-purple-400",
    dot: "bg-purple-500",
    subtleDot: "bg-purple-500/15 text-purple-700 dark:text-purple-300",
  },
  yellow: {
    key: "yellow",
    label: "Jaune",
    block:
      "bg-yellow-50 text-yellow-950 border-yellow-200 dark:bg-yellow-950/45 dark:text-yellow-100 dark:border-yellow-900",
    accent: "bg-yellow-500 dark:bg-yellow-400",
    dot: "bg-yellow-500",
    subtleDot: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-300",
  },
  fuchsia: {
    key: "fuchsia",
    label: "Fuchsia",
    block:
      "bg-fuchsia-50 text-fuchsia-950 border-fuchsia-200 dark:bg-fuchsia-950/45 dark:text-fuchsia-100 dark:border-fuchsia-900",
    accent: "bg-fuchsia-500 dark:bg-fuchsia-400",
    dot: "bg-fuchsia-500",
    subtleDot: "bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300",
  },
  sky: {
    key: "sky",
    label: "Bleu ciel",
    block:
      "bg-sky-50 text-sky-950 border-sky-200 dark:bg-sky-950/45 dark:text-sky-100 dark:border-sky-900",
    accent: "bg-sky-500 dark:bg-sky-400",
    dot: "bg-sky-500",
    subtleDot: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  },
  lime: {
    key: "lime",
    label: "Citron",
    block:
      "bg-lime-50 text-lime-950 border-lime-200 dark:bg-lime-950/45 dark:text-lime-100 dark:border-lime-900",
    accent: "bg-lime-500 dark:bg-lime-400",
    dot: "bg-lime-500",
    subtleDot: "bg-lime-500/15 text-lime-700 dark:text-lime-300",
  },
  pink: {
    key: "pink",
    label: "Framboise",
    block:
      "bg-pink-50 text-pink-950 border-pink-200 dark:bg-pink-950/45 dark:text-pink-100 dark:border-pink-900",
    accent: "bg-pink-500 dark:bg-pink-400",
    dot: "bg-pink-500",
    subtleDot: "bg-pink-500/15 text-pink-700 dark:text-pink-300",
  },
  green: {
    key: "green",
    label: "Vert",
    block:
      "bg-green-50 text-green-950 border-green-200 dark:bg-green-950/45 dark:text-green-100 dark:border-green-900",
    accent: "bg-green-500 dark:bg-green-400",
    dot: "bg-green-500",
    subtleDot: "bg-green-500/15 text-green-700 dark:text-green-300",
  },
  slate: {
    key: "slate",
    label: "Ardoise",
    block:
      "bg-slate-50 text-slate-950 border-slate-200 dark:bg-slate-950/45 dark:text-slate-100 dark:border-slate-900",
    accent: "bg-slate-500 dark:bg-slate-400",
    dot: "bg-slate-500",
    subtleDot: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
  },
  stone: {
    key: "stone",
    label: "Pierre",
    block:
      "bg-stone-50 text-stone-950 border-stone-200 dark:bg-stone-950/45 dark:text-stone-100 dark:border-stone-900",
    accent: "bg-stone-500 dark:bg-stone-400",
    dot: "bg-stone-500",
    subtleDot: "bg-stone-500/15 text-stone-700 dark:text-stone-300",
  },
  gray: {
    key: "gray",
    label: "Gris",
    block:
      "bg-gray-50 text-gray-950 border-gray-200 dark:bg-gray-950/45 dark:text-gray-100 dark:border-gray-900",
    accent: "bg-gray-500 dark:bg-gray-400",
    dot: "bg-gray-500",
    subtleDot: "bg-gray-500/15 text-gray-700 dark:text-gray-300",
  },
};

/** Retourne le style d'une couleur — repli sûr sur « blue ». */
export function getSubjectColor(key: string | null | undefined): SubjectColorStyle {
  if (key && key in STYLES) return STYLES[key as SubjectColorKey];
  return STYLES.blue;
}

export function isSubjectColorKey(key: string): key is SubjectColorKey {
  return key in STYLES;
}

/**
 * Attribution déterministe et stable d'une couleur par index.
 * Utilisée pour l'aperçu, la répartition à la création et cohérente avec le
 * backfill SQL de la migration 0016.
 */
export function defaultColorForIndex(index: number): SubjectColorKey {
  const keys = SUBJECT_COLOR_KEYS;
  const i = ((index % keys.length) + keys.length) % keys.length;
  return keys[i]!;
}

/**
 * Ordre harmonique alterné pour la distribution automatique des couleurs.
 * Évite d'attribuer des teintes trop proches (ex. bleu, indigo, violet)
 * à des matières consécutives dans un même emploi du temps.
 */
export const HARMONIC_COLOR_ORDER: readonly SubjectColorKey[] = [
  "indigo",
  "emerald",
  "amber",
  "rose",
  "teal",
  "violet",
  "cyan",
  "orange",
  "purple",
  "blue",
  "pink",
  "green",
  "fuchsia",
  "sky",
  "lime",
  "red",
  "yellow",
  "slate",
  "stone",
  "gray",
] as const;

/**
 * Attribution déterministe et stable basée sur l'identifiant immuable de la matière.
 * Utilise un hachage FNV-1a sur l'id pour garantir que la matière conserve TOUJOURS
 * la même couleur, indépendamment de l'ordre d'affichage, des filtres ou des rechargements.
 */
export function colorForSubjectId(id: string | null | undefined): SubjectColorKey {
  if (!id) return "indigo";
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const index = Math.abs(hash >>> 0) % HARMONIC_COLOR_ORDER.length;
  return HARMONIC_COLOR_ORDER[index]!;
}

/**
 * Résout les couleurs de l'ensemble des matières d'une classe.
 * - Si les matières ont déjà des couleurs distinctes valides (personnalisées), elles sont préservées.
 * - Si les matières partagent toutes la valeur par défaut ("blue") ou ont des doublons,
 *   une couleur distincte de la palette harmonique est attribuée de manière stable et déterministe
 *   (triée par id immuable).
 * - Aucune dépendance à l'ordre d'affichage dans la page : l'attribution est 100% stable.
 */
export function resolveClassSubjectColors<T extends { id: string; colorKey?: string | null }>(
  subjects: T[]
): Array<T & { colorKey: SubjectColorKey }> {
  if (!subjects || subjects.length === 0) return [];

  // Vérifier si toutes les matières sont sur la valeur par défaut "blue" ou non configurées
  const validCustomKeys = subjects.filter(
    (s) => s.colorKey && isSubjectColorKey(s.colorKey) && s.colorKey !== "blue"
  );

  // Si chaque matière a déjà une couleur distincte personnalisée (pas toutes 'blue') :
  const allCustomAndUnique =
    validCustomKeys.length === subjects.length &&
    new Set(validCustomKeys.map((s) => s.colorKey)).size === subjects.length;

  if (allCustomAndUnique) {
    return subjects.map((s) => ({
      ...s,
      colorKey: (s.colorKey as SubjectColorKey) || "blue",
    }));
  }

  // Tri par ID immuable pour une stabilité absolue quelle que soit la requête
  const sorted = [...subjects].sort((a, b) => a.id.localeCompare(b.id));
  const assigned = new Map<string, SubjectColorKey>();
  const usedColors = new Set<SubjectColorKey>();

  // Conserver en priorité les matières ayant une couleur explicite non-blue unique
  for (const s of sorted) {
    if (s.colorKey && isSubjectColorKey(s.colorKey) && s.colorKey !== "blue" && !usedColors.has(s.colorKey)) {
      assigned.set(s.id, s.colorKey);
      usedColors.add(s.colorKey);
    }
  }

  // Pour les matières restantes (celles en 'blue' ou sans couleur), attribuer selon HARMONIC_COLOR_ORDER
  let colorIdx = 0;
  for (const s of sorted) {
    if (!assigned.has(s.id)) {
      while (colorIdx < HARMONIC_COLOR_ORDER.length && usedColors.has(HARMONIC_COLOR_ORDER[colorIdx]!)) {
        colorIdx++;
      }
      const chosen =
        colorIdx < HARMONIC_COLOR_ORDER.length
          ? HARMONIC_COLOR_ORDER[colorIdx]!
          : defaultColorForIndex(assigned.size);
      assigned.set(s.id, chosen);
      usedColors.add(chosen);
      colorIdx++;
    }
  }

  return subjects.map((s) => ({
    ...s,
    colorKey: assigned.get(s.id) ?? colorForSubjectId(s.id),
  }));
}
