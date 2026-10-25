import { describe, it, expect } from "vitest";
import {
  conflictMessage,
  findConflict,
  sessionsConflict,
  timeRangesOverlap,
  validityRangesOverlap,
  type ConflictCandidate,
  type ExistingSession,
} from "@/lib/schedule/conflicts";

// ---------------------------------------------------------------------------
// Tests conflits — même règle que la contrainte d'exclusion GiST
//  `schedule_sessions_no_overlap` (migration 0016) : même jour, plages
//  horaires strictement chevauchantes, périodes de validité croisées
//  (bornes inclusives). La fin égale au début d'une autre séance n'est PAS
//  un chevauchement.
// ---------------------------------------------------------------------------

function existing(over: Partial<ExistingSession> = {}): ExistingSession {
  return {
    id: "e1",
    dayOfWeek: 3,
    startTime: "08:00",
    endTime: "10:00",
    validFrom: "2026-01-01",
    validUntil: null,
    ...over,
  };
}

function candidate(over: Partial<ConflictCandidate> = {}): ConflictCandidate {
  return {
    dayOfWeek: 3,
    startTime: "09:00",
    endTime: "11:00",
    validFrom: "2026-01-01",
    validUntil: null,
    ...over,
  };
}

describe("timeRangesOverlap — chevauchement strict", () => {
  it("détecte un chevauchement partiel", () => {
    expect(timeRangesOverlap(480, 600, 540, 660)).toBe(true);
  });

  it("détecte une séance contenue dans une autre", () => {
    expect(timeRangesOverlap(480, 720, 540, 600)).toBe(true);
    expect(timeRangesOverlap(540, 600, 480, 720)).toBe(true);
  });

  it("n'est pas un chevauchement quand la fin égale le début (cours consécutifs)", () => {
    expect(timeRangesOverlap(480, 600, 600, 720)).toBe(false);
    expect(timeRangesOverlap(600, 720, 480, 600)).toBe(false);
  });

  it("n'est pas un chevauchement pour des plages disjointes", () => {
    expect(timeRangesOverlap(480, 540, 600, 660)).toBe(false);
    expect(timeRangesOverlap(600, 660, 480, 540)).toBe(false);
  });
});

describe("validityRangesOverlap — bornes inclusives", () => {
  it("détecte des périodes qui se croisent", () => {
    expect(validityRangesOverlap("2026-01-01", "2026-06-30", "2026-03-01", "2026-12-31")).toBe(true);
  });

  it("considère les bornes comme inclusives (contact = chevauchement)", () => {
    expect(validityRangesOverlap("2026-01-01", "2026-03-31", "2026-03-31", "2026-06-30")).toBe(true);
    expect(validityRangesOverlap("2026-03-31", "2026-06-30", "2026-01-01", "2026-03-31")).toBe(true);
  });

  it("n'est pas un chevauchement pour des périodes disjointes", () => {
    expect(validityRangesOverlap("2026-01-01", "2026-03-31", "2026-04-01", "2026-06-30")).toBe(false);
    expect(validityRangesOverlap("2026-04-01", "2026-06-30", "2026-01-01", "2026-03-31")).toBe(false);
  });

  it("traite « sans fin » comme une validité illimitée", () => {
    expect(validityRangesOverlap("2026-01-01", null, "2027-01-01", null)).toBe(true);
    expect(validityRangesOverlap("2026-01-01", null, "2026-01-01", "2026-01-01")).toBe(true);
    expect(validityRangesOverlap("2030-01-01", "2030-12-31", "2030-06-01", null)).toBe(true);
    expect(validityRangesOverlap("2026-01-01", "2026-12-31", "2027-01-01", null)).toBe(false);
  });
});

describe("sessionsConflict — combinaison des règles", () => {
  it("conflit : même jour, horaires qui se croisent, validités croisées", () => {
    expect(sessionsConflict(candidate(), existing())).toBe(true);
  });

  it("pas de conflit pour un autre jour de la semaine", () => {
    expect(sessionsConflict(candidate({ dayOfWeek: 4 }), existing({ dayOfWeek: 3 }))).toBe(false);
    expect(sessionsConflict(candidate({ dayOfWeek: 1 }), existing({ dayOfWeek: 7 }))).toBe(false);
  });

  it("pas de conflit pour des horaires adjacents (fin = début)", () => {
    expect(sessionsConflict(candidate({ startTime: "10:00", endTime: "12:00" }), existing())).toBe(false);
    expect(sessionsConflict(candidate({ startTime: "06:00", endTime: "08:00" }), existing())).toBe(false);
  });

  it("pas de conflit quand les validités sont disjointes", () => {
    const b = existing({ validFrom: "2026-01-01", validUntil: "2026-06-30" });
    expect(sessionsConflict(candidate({ validFrom: "2026-09-01", validUntil: "2026-12-31" }), b)).toBe(false);
  });

  it("accepte les horaires au format PostgreSQL « HH:MM:SS »", () => {
    expect(
      sessionsConflict(
        candidate({ startTime: "09:00:00", endTime: "11:00:00" }),
        existing({ startTime: "08:00:00", endTime: "10:00:00" })
      )
    ).toBe(true);
    expect(
      sessionsConflict(
        candidate({ startTime: "10:00:00", endTime: "12:00:00" }),
        existing({ startTime: "08:00:00", endTime: "10:00:00" })
      )
    ).toBe(false);
  });
});

describe("findConflict", () => {
  const existingList: ExistingSession[] = [
    existing({ id: "a", dayOfWeek: 3, startTime: "08:00", endTime: "10:00" }),
    existing({ id: "b", dayOfWeek: 5, startTime: "14:00", endTime: "16:00" }),
    existing({ id: "c", dayOfWeek: 3, startTime: "09:30", endTime: "11:00" }),
  ];

  it("retourne la première séance en conflit", () => {
    const conflict = findConflict(candidate(), existingList);
    expect(conflict?.id).toBe("a");
  });

  it("retourne null sans conflit", () => {
    expect(findConflict(candidate({ dayOfWeek: 2 }), existingList)).toBeNull();
    expect(findConflict(candidate({ startTime: "11:00", endTime: "12:00" }), existingList)).toBeNull();
    expect(findConflict(candidate(), [])).toBeNull();
  });

  it("exclut la séance en cours d'édition (excludeSessionId)", () => {
    const editCandidate = candidate({ excludeSessionId: "a" });
    expect(findConflict(editCandidate, existingList)?.id).toBe("c");
    expect(findConflict(candidate({ excludeSessionId: "a", startTime: "11:00", endTime: "12:00" }), existingList)).toBeNull();
  });
});

describe("conflictMessage", () => {
  it("produit un message clair et non vide", () => {
    const message = conflictMessage();
    expect(message.length).toBeGreaterThan(0);
    expect(message).toContain("chevauche");
  });
});
