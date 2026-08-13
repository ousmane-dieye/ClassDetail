import { describe, it, expect } from "vitest";
import { getTaskColor, daysUntilDue, shouldHardDelete } from "@/lib/business/taskStatus";

const TZ = "Africa/Dakar";
const NOW = new Date("2026-08-12T09:00:00Z"); // référence de test

function dueInDays(n: number): Date {
  const d = new Date(NOW);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}

describe("getTaskColor", () => {
  it("retourne VERT pour J-6 et plus", () => {
    expect(getTaskColor(dueInDays(6), NOW, TZ)).toBe("GREEN");
    expect(getTaskColor(dueInDays(10), NOW, TZ)).toBe("GREEN");
  });

  it("retourne VERT pour J-5", () => {
    expect(getTaskColor(dueInDays(5), NOW, TZ)).toBe("GREEN");
  });

  it("retourne JAUNE pour J-4, J-3, J-2", () => {
    expect(getTaskColor(dueInDays(4), NOW, TZ)).toBe("YELLOW");
    expect(getTaskColor(dueInDays(3), NOW, TZ)).toBe("YELLOW");
    expect(getTaskColor(dueInDays(2), NOW, TZ)).toBe("YELLOW");
  });

  it("retourne ROUGE pour J-1 et jour J", () => {
    expect(getTaskColor(dueInDays(1), NOW, TZ)).toBe("RED");
    expect(getTaskColor(dueInDays(0), NOW, TZ)).toBe("RED");
  });

  it("retourne EXPIRED après la date limite", () => {
    expect(getTaskColor(dueInDays(-1), NOW, TZ)).toBe("EXPIRED");
    expect(getTaskColor(dueInDays(-5), NOW, TZ)).toBe("EXPIRED");
  });
});

describe("daysUntilDue", () => {
  it("calcule correctement le nombre de jours restants", () => {
    expect(daysUntilDue(dueInDays(3), NOW, TZ)).toBe(3);
    expect(daysUntilDue(dueInDays(0), NOW, TZ)).toBe(0);
    expect(daysUntilDue(dueInDays(-2), NOW, TZ)).toBe(-2);
  });
});

describe("shouldHardDelete", () => {
  it("ne supprime pas avant 24h après l'échéance", () => {
    const due = new Date(NOW.getTime() - 23 * 60 * 60 * 1000);
    expect(shouldHardDelete(due, NOW)).toBe(false);
  });

  it("supprime après 24h révolues", () => {
    const due = new Date(NOW.getTime() - 25 * 60 * 60 * 1000);
    expect(shouldHardDelete(due, NOW)).toBe(true);
  });
});
