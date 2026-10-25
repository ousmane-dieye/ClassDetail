import { describe, it, expect } from "vitest";
import {
  evaluationTimingsOverlap,
  findEvaluationConflict,
  findScheduleConflictsOnDate,
  evaluationConflictWarnings,
  hasCompleteTimes,
  type EvaluationTiming,
} from "@/lib/evaluations/conflicts";
import type { SessionException, SessionRecurrence } from "@/lib/schedule/occurrences";

// ---------------------------------------------------------------------------
// Tests conflits — module Évaluations.
//  Conflits = AVERTISSEMENTS non bloquants. Une évaluation sans heure
//  complète n'entre dans AUCUNE détection (information jamais supposée).
// ---------------------------------------------------------------------------

function timing(over: Partial<EvaluationTiming> = {}): EvaluationTiming {
  return {
    id: "ev-1",
    date: "2026-06-15",
    startTime: "08:00",
    endTime: "10:00",
    title: "Examen",
    status: "PUBLISHED",
    ...over,
  };
}

describe("hasCompleteTimes", () => {
  it("exige à la fois une heure de début et de fin", () => {
    expect(hasCompleteTimes({ startTime: "08:00", endTime: "10:00" })).toBe(true);
    expect(hasCompleteTimes({ startTime: "08:00", endTime: null })).toBe(false);
    expect(hasCompleteTimes({ startTime: null, endTime: "10:00" })).toBe(false);
    expect(hasCompleteTimes({ startTime: null, endTime: null })).toBe(false);
  });
});

describe("evaluationTimingsOverlap", () => {
  it("détecte un chevauchement le même jour", () => {
    expect(
      evaluationTimingsOverlap(timing(), timing({ id: "ev-2", startTime: "09:00", endTime: "11:00" }))
    ).toBe(true);
  });

  it("n'entre jamais en jeu pour des jours différents", () => {
    expect(
      evaluationTimingsOverlap(timing(), timing({ id: "ev-2", date: "2026-06-16", startTime: "08:30" }))
    ).toBe(false);
  });

  it("n'entre jamais en jeu si l'une des plages est incomplète", () => {
    expect(
      evaluationTimingsOverlap(timing({ startTime: null }), timing({ id: "ev-2", startTime: "08:30" }))
    ).toBe(false);
    expect(
      evaluationTimingsOverlap(timing(), timing({ id: "ev-2", endTime: null, startTime: "08:30" }))
    ).toBe(false);
  });

  it("une fin égale à un début n'est pas un chevauchement", () => {
    expect(
      evaluationTimingsOverlap(timing(), timing({ id: "ev-2", startTime: "10:00", endTime: "12:00" }))
    ).toBe(false);
  });
});

describe("findEvaluationConflict", () => {
  it("ignore l'évaluation éditée elle-même (excludeId implicite)", () => {
    const existing = [timing({ id: "ev-1" })];
    expect(findEvaluationConflict(timing({ id: "ev-1" }), existing)).toBeNull();
  });

  it("ignore les évaluations annulées", () => {
    const existing = [timing({ id: "ev-2", status: "CANCELLED", startTime: "08:30" })];
    expect(findEvaluationConflict(timing({ id: "ev-1" }), existing)).toBeNull();
  });

  it("retourne le premier conflit trouvé", () => {
    const clash = timing({ id: "ev-9", title: "TP" });
    const found = findEvaluationConflict(timing({ id: "ev-1" }), [clash]);
    expect(found?.id).toBe("ev-9");
  });
});

// ── Conflits avec l'emploi du temps ────────────────────────────────────────

function session(over: Partial<SessionRecurrence> = {}): SessionRecurrence {
  return {
    id: "s1",
    classId: "c1",
    subjectId: "sub-1",
    dayOfWeek: 1, // lundi
    startTime: "08:00",
    endTime: "10:00",
    room: "A1",
    teacher: null,
    validFrom: "2026-01-01",
    validUntil: null,
    status: "PUBLISHED",
    ...over,
  };
}

describe("findScheduleConflictsOnDate", () => {
  // 2026-06-15 est un lundi.
  it("détecte un cours chevauchant l'évaluation", () => {
    const conflicts = findScheduleConflictsOnDate(timing(), [session()], []);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.subjectId).toBe("sub-1");
  });

  it("retourne vide si l'évaluation n'a pas d'heure complète", () => {
    expect(findScheduleConflictsOnDate(timing({ startTime: null }), [session()], [])).toEqual([]);
  });

  it("ignore une séance annulée par une exception datée", () => {
    const exception: SessionException = {
      id: "x1",
      sessionId: "s1",
      date: "2026-06-15",
      isCancelled: true,
      newStartTime: null,
      newEndTime: null,
      newRoom: null,
      newSubjectId: null,
      note: null,
    };
    expect(findScheduleConflictsOnDate(timing(), [session()], [exception])).toEqual([]);
  });

  it("ignore une séance hors de ce jour de la semaine", () => {
    expect(
      findScheduleConflictsOnDate(timing({ date: "2026-06-16" }), [session()], [])
    ).toEqual([]);
  });
});

describe("evaluationConflictWarnings — non bloquants, messages lisibles", () => {
  it("signale un chevauchement avec une autre évaluation", () => {
    const warnings = evaluationConflictWarnings(
      timing({ id: "ev-1" }),
      [timing({ id: "ev-2", title: "Contrôle", startTime: "09:00" })],
      [],
      [],
      {}
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("Contrôle");
  });

  it("signale un chevauchement avec un cours en nommant la matière", () => {
    const warnings = evaluationConflictWarnings(timing({ id: "ev-1" }), [], [session()], [], {
      "sub-1": "Mathématiques",
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("Mathématiques");
    expect(warnings[0]).toContain("08:00");
  });

  it("retourne un tableau vide quand tout est libre", () => {
    expect(
      evaluationConflictWarnings(
        timing({ id: "ev-1", startTime: "14:00", endTime: "16:00" }),
        [],
        [session()],
        [],
        { "sub-1": "Mathématiques" }
      )
    ).toEqual([]);
  });

  it("une évaluation sans heure ne produit jamais d'avertissement", () => {
    const warnings = evaluationConflictWarnings(
      timing({ id: "ev-1", startTime: null, endTime: null }),
      [timing({ id: "ev-2", startTime: "08:00" })],
      [session()],
      [],
      { "sub-1": "Mathématiques" }
    );
    expect(warnings).toEqual([]);
  });
});
