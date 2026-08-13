import { describe, it, expect } from "vitest";
import { getReminderKind, shouldSendReminder, formatDueDate, formatDueTime } from "@/lib/email/reminders";

const TZ = "Africa/Dakar";
const NOW = new Date("2026-09-12T09:00:00Z"); // référence : un devoir rendu le 15/09 est à J-3 le 12/09

function dueInDays(n: number): Date {
  const d = new Date(NOW);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}

describe("getReminderKind", () => {
  it("retourne J3 à J-3", () => {
    expect(getReminderKind(dueInDays(3), NOW, TZ)).toBe("J3");
  });

  it("retourne J1 à J-1", () => {
    expect(getReminderKind(dueInDays(1), NOW, TZ)).toBe("J1");
  });

  it("retourne null hors J-3 / J-1", () => {
    expect(getReminderKind(dueInDays(5), NOW, TZ)).toBeNull();
    expect(getReminderKind(dueInDays(2), NOW, TZ)).toBeNull();
    expect(getReminderKind(dueInDays(0), NOW, TZ)).toBeNull();
  });
});

describe("shouldSendReminder", () => {
  it("décide d'envoyer à J-3", () => {
    const d = shouldSendReminder({ dueDate: dueInDays(3), now: NOW, timeZone: TZ });
    expect(d.send).toBe(true);
    expect(d.kind).toBe("J3");
  });

  it("décide d'envoyer à J-1", () => {
    const d = shouldSendReminder({ dueDate: dueInDays(1), now: NOW, timeZone: TZ });
    expect(d.send).toBe(true);
    expect(d.kind).toBe("J1");
  });

  it("ne rappelle pas un devoir déjà rendu", () => {
    const d = shouldSendReminder({
      dueDate: dueInDays(1),
      now: NOW,
      timeZone: TZ,
      alreadySubmitted: true,
    });
    expect(d.send).toBe(false);
    expect(d.reason).toBe("already_submitted");
  });

  it("ne rappelle pas une tâche expirée", () => {
    const d = shouldSendReminder({ dueDate: dueInDays(1), now: NOW, timeZone: TZ, expired: true });
    expect(d.send).toBe(false);
    expect(d.reason).toBe("expired");
  });

  it("ne renvoie pas un rappel déjà envoyé", () => {
    const d = shouldSendReminder({ dueDate: dueInDays(3), now: NOW, timeZone: TZ, alreadySent: true });
    expect(d.send).toBe(false);
    expect(d.reason).toBe("already_sent");
  });
});

describe("formatDueDate / formatDueTime", () => {
  const due = new Date("2026-09-15T23:59:00Z");

  it("formate la date en français long", () => {
    expect(formatDueDate(due, TZ)).toBe("15 septembre 2026");
  });

  it("formate l'heure", () => {
    const time = formatDueTime(due, TZ);
    expect(time.length).toBeGreaterThan(0);
  });
});
