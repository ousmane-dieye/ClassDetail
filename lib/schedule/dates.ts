/**
 * Logique temporelle du module Emploi du temps.
 *
 * Fuseau de référence de l'application : NEXT_PUBLIC_APP_TIMEZONE
 * (Africa/Dakar par défaut). Toutes les règles récurrentes sont exprimées en
 * heure LOCALE de ce fuseau : jour ISO (1 = lundi … 7 = dimanche) et `time`
 * PostgreSQL ("HH:MM:SS"). Les dates circulent en "YYYY-MM-DD" (ISO), sans
 * dépendre du fuseau du navigateur.
 *
 * Toutes les fonctions sont pures (testables sous Node, sans DOM).
 */

/** Fuseau de référence de l'application. */
export const APP_TIMEZONE = process.env.NEXT_PUBLIC_APP_TIMEZONE || "Africa/Dakar";

/** Formatteur "YYYY-MM-DD" dans le fuseau appliqué (mémoïsé). */
const ymdFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Formatteur de composants horaires dans le fuseau appliqué. */
const partsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: APP_TIMEZONE,
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const WEEKDAY_TO_ISO: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

export interface ZonedNow {
  /** Date locale "YYYY-MM-DD" dans le fuseau appliqué. */
  todayYmd: string;
  /** Jour ISO de la date locale (1 = lundi … 7 = dimanche). */
  dayOfWeek: number;
  /** Minutes depuis minuit local. */
  minutesOfDay: number;
}

/** Composants « maintenant » dans le fuseau de l'application. */
export function getZonedNow(date: Date = new Date()): ZonedNow {
  const todayYmd = ymdFormatter.format(date);
  const parts = partsFormatter.formatToParts(date);
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return {
    todayYmd,
    dayOfWeek: WEEKDAY_TO_ISO[weekday] ?? 1,
    minutesOfDay: hour * 60 + minute,
  };
}

/* ──────────────────────────────────────────────────────────────────
   Arithmétique de dates ISO (indépendante du fuseau)
   ────────────────────────────────────────────────────────────────── */

function dateFromYmd(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  // Date UTC midi : aucune dérive lors des additions/soustractions.
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1, 12));
}

function ymdFromDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Jour ISO (1 = lundi … 7 = dimanche) d'une date "YYYY-MM-DD". */
export function isoDayOfWeek(ymd: string): number {
  const day = dateFromYmd(ymd).getUTCDay(); // 0 = dimanche
  return day === 0 ? 7 : day;
}

/** Ajoute n jours à une date ISO. */
export function addDaysYmd(ymd: string, n: number): string {
  const d = dateFromYmd(ymd);
  d.setUTCDate(d.getUTCDate() + n);
  return ymdFromDate(d);
}

/**
 * Prochaine occurrence (aujourd'hui inclus) d'un jour de la semaine donné.
 * Permet à l'assistant de répondre « lundi » sans jamais faire de calcul de
 * date côté modèle : la pendule de l'application fait foi.
 * Ex. aujourd'hui = jeudi 22/10 → nextWeekdayYmd(..., 1) = lundi 26/10.
 */
export function nextWeekdayYmd(todayYmd: string, targetDow: number): string {
  const todayDow = isoDayOfWeek(todayYmd);
  const delta = (targetDow - todayDow + 7) % 7; // 0 si aujourd'hui est ce jour
  return addDaysYmd(todayYmd, delta);
}

/** Lundi (1er jour ISO) de la semaine contenant la date. */
export function startOfWeekYmd(ymd: string): string {
  const dow = isoDayOfWeek(ymd);
  return addDaysYmd(ymd, 1 - dow);
}

/** Les 7 dates ISO d'une semaine à partir de son lundi. */
export function weekDaysYmd(weekStartYmd: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDaysYmd(weekStartYmd, i));
}

/** Comparaison lexicographique sûre des dates ISO (valides). */
export function ymdLte(a: string, b: string): boolean {
  return a <= b;
}

export function ymdGte(a: string, b: string): boolean {
  return a >= b;
}

/* ──────────────────────────────────────────────────────────────────
   Horaires ("HH:MM[:SS]" → minutes ; minutes → "HH:MM")
   ────────────────────────────────────────────────────────────────── */

/** Convertit "HH:MM:SS" ou "HH:MM" en minutes depuis minuit. */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** Convertit des minutes en "HH:MM" (plafonné à 23:59). */
export function minutesToTime(minutes: number): string {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.floor(minutes)));
  const h = String(Math.floor(clamped / 60)).padStart(2, "0");
  const m = String(clamped % 60).padStart(2, "0");
  return `${h}:${m}`;
}

/* ──────────────────────────────────────────────────────────────────
   Libellés (français)
   ────────────────────────────────────────────────────────────────── */

export const DAY_SHORT_LABELS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"] as const;
export const DAY_MIN_LABELS = ["L", "M", "M", "J", "V", "S", "D"] as const;
export const DAY_LONG_LABELS = [
  "lundi",
  "mardi",
  "mercredi",
  "jeudi",
  "vendredi",
  "samedi",
  "dimanche",
] as const;

/** Libellé court d'un jour ISO (1-7). */
export function dayShortLabel(dayOfWeek: number): string {
  return DAY_SHORT_LABELS[dayOfWeek - 1] ?? "";
}

/** Libellé long d'un jour ISO (1-7). */
export function dayLongLabel(dayOfWeek: number): string {
  return DAY_LONG_LABELS[dayOfWeek - 1] ?? "";
}

/** Date ISO → "lundi 13 octobre" (français, sans dépendance au fuseau). */
export function formatYmdLong(ymd: string): string {
  const d = dateFromYmd(ymd);
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(d);
}

/** Date ISO → "lun. 13 oct." (français, compact). */
export function formatYmdCompact(ymd: string): string {
  const d = dateFromYmd(ymd);
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(d);
}

/** Date ISO → numéro du jour dans le mois. */
export function dayNumber(ymd: string): number {
  return dateFromYmd(ymd).getUTCDate();
}

/** "13 – 19 octobre 2025" (plage de semaine). */
export function formatWeekRange(weekStartYmd: string): string {
  const end = addDaysYmd(weekStartYmd, 6);
  const startD = dateFromYmd(weekStartYmd);
  const endD = dateFromYmd(end);
  const sameMonth =
    startD.getUTCFullYear() === endD.getUTCFullYear() &&
    startD.getUTCMonth() === endD.getUTCMonth();
  const monthFmt = new Intl.DateTimeFormat("fr-FR", { month: "long", timeZone: "UTC" });
  const yearFmt = new Intl.DateTimeFormat("fr-FR", { year: "numeric", timeZone: "UTC" });
  if (sameMonth) {
    return `${startD.getUTCDate()} – ${endD.getUTCDate()} ${monthFmt.format(endD)} ${yearFmt.format(endD)}`;
  }
  // Semaine à cheval sur deux années : on affiche l'année de départ aussi.
  const yearsDiffer = startD.getUTCFullYear() !== endD.getUTCFullYear();
  const startLabel = `${startD.getUTCDate()} ${monthFmt.format(startD)}${yearsDiffer ? ` ${yearFmt.format(startD)}` : ""}`;
  const endLabel = `${endD.getUTCDate()} ${monthFmt.format(endD)} ${yearFmt.format(endD)}`;
  return `${startLabel} – ${endLabel}`;
}
