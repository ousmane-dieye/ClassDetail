/**
 * Logique métier PURE et testable pour le calcul de l'état visuel
 * d'une tâche en fonction de sa date d'échéance.
 *
 * Règles (voir spécification §12) :
 *   J-6 et plus  -> VERT
 *   J-5          -> VERT
 *   J-4, J-3, J-2 -> JAUNE
 *   J-1          -> ROUGE
 *   Jour J       -> ROUGE
 *   Après J      -> EXPIRED (visible 24h puis suppression)
 *
 * "J" = jour calendaire de due_date, dans le fuseau de l'application
 * (NEXT_PUBLIC_APP_TIMEZONE, ex: Africa/Dakar). On raisonne en nombre
 * de jours calendaires entiers, pas en heures, pour éviter les effets
 * de bord liés à l'heure de la journée.
 */

export type TaskColor = "GREEN" | "YELLOW" | "RED" | "EXPIRED";

const APP_TIMEZONE = process.env.NEXT_PUBLIC_APP_TIMEZONE || "Africa/Dakar";

/** Retourne la date (YYYY-MM-DD) d'un Date dans un fuseau donné. */
function toZonedDateOnly(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date); // format en-CA => YYYY-MM-DD
}

/** Nombre de jours calendaires entre deux dates (dueDate - now), dans le fuseau app. */
export function daysUntilDue(
  dueDate: Date,
  now: Date = new Date(),
  timeZone: string = APP_TIMEZONE
): number {
  const dueStr = toZonedDateOnly(dueDate, timeZone);
  const nowStr = toZonedDateOnly(now, timeZone);

  const due = new Date(`${dueStr}T00:00:00Z`);
  const today = new Date(`${nowStr}T00:00:00Z`);

  const diffMs = due.getTime() - today.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Calcule la couleur d'une tâche.
 * daysLeft > 5   -> GREEN
 * daysLeft in [4,5] -> en fait 5 => GREEN, 4..2 => YELLOW (voir table exacte ci-dessous)
 */
export function getTaskColor(
  dueDate: Date,
  now: Date = new Date(),
  timeZone: string = APP_TIMEZONE
): TaskColor {
  const daysLeft = daysUntilDue(dueDate, now, timeZone);

  if (daysLeft < 0) return "EXPIRED";
  if (daysLeft === 0) return "RED"; // Jour J
  if (daysLeft === 1) return "RED"; // J-1
  if (daysLeft >= 2 && daysLeft <= 4) return "YELLOW"; // J-2, J-3, J-4
  return "GREEN"; // J-5 et plus
}

/** Une tâche expirée depuis plus de 24h doit être supprimée définitivement. */
export function shouldHardDelete(dueDate: Date, now: Date = new Date()): boolean {
  const msSinceDue = now.getTime() - dueDate.getTime();
  return msSinceDue > 24 * 60 * 60 * 1000;
}

export const TASK_COLOR_HEX: Record<TaskColor, string> = {
  GREEN: "#16a34a",
  YELLOW: "#ca8a04",
  RED: "#dc2626",
  EXPIRED: "#6b7280",
};
