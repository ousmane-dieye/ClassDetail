/**
 * Logique PURE des rappels de devoirs (J-3 / J-1) — sans aucune I/O,
 * entièrement testable. La décision d'envoyer ou non un rappel repose sur :
 *   - le nombre de jours calendaires restants dans le fuseau de l'app ;
 *   - l'état de la tâche (expirée ? déjà rendue ? rappel déjà envoyé ?).
 */

import { daysUntilDue } from "@/lib/business/taskStatus";

export type ReminderKind = "J3" | "J1";

const APP_TIMEZONE = process.env.NEXT_PUBLIC_APP_TIMEZONE || "Africa/Dakar";

export interface ReminderDecisionInput {
  dueDate: Date;
  now?: Date;
  timeZone?: string;
  /** true si la tâche est expirée (is_expired). */
  expired?: boolean;
  /** true si l'étudiant a déjà rendu le devoir. */
  alreadySubmitted?: boolean;
  /** true si un email du même type a déjà été envoyé (SENT). */
  alreadySent?: boolean;
}

export interface ReminderDecision {
  kind: ReminderKind | null;
  send: boolean;
  reason: "J3" | "J1" | "no_reminder" | "expired" | "already_submitted" | "already_sent" | "not_yet";
}

/**
 * Détermine le type de rappel attendu (J3 ou J1) selon le nombre de jours restants.
 * Retourne null si on n'est ni à J-3 ni à J-1.
 */
export function getReminderKind(dueDate: Date, now: Date = new Date(), timeZone: string = APP_TIMEZONE): ReminderKind | null {
  const daysLeft = daysUntilDue(dueDate, now, timeZone);
  if (daysLeft === 3) return "J3";
  if (daysLeft === 1) return "J1";
  return null;
}

/**
 * Décision d'envoi complète. Ne décide JAMAIS d'envoyer si :
 *   - la tâche est expirée ;
 *   - l'étudiant a déjà rendu le devoir ;
 *   - un email du même type a déjà été envoyé ;
 *   - on n'est ni à J-3 ni à J-1.
 */
export function shouldSendReminder(input: ReminderDecisionInput): ReminderDecision {
  const { dueDate, now = new Date(), timeZone = APP_TIMEZONE, expired, alreadySubmitted, alreadySent } = input;

  const kind = getReminderKind(dueDate, now, timeZone);
  if (!kind) {
    const daysLeft = daysUntilDue(dueDate, now, timeZone);
    return { kind: null, send: false, reason: daysLeft > 3 ? "not_yet" : "no_reminder" };
  }
  if (expired) return { kind, send: false, reason: "expired" };
  if (alreadySubmitted) return { kind, send: false, reason: "already_submitted" };
  if (alreadySent) return { kind, send: false, reason: "already_sent" };
  return { kind, send: true, reason: kind };
}

/** Date limite au format long français (ex: "15 septembre 2026"). */
export function formatDueDate(dueDate: Date, timeZone: string = APP_TIMEZONE): string {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone }).format(dueDate);
}

/** Heure limite (ex: "23:59"). */
export function formatDueTime(dueDate: Date, timeZone: string = APP_TIMEZONE): string {
  return new Intl.DateTimeFormat("fr-FR", { timeStyle: "short", timeZone }).format(dueDate);
}
