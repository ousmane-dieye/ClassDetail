import { describe, it, expect } from "vitest";
import {
  partitionEvaluations,
  groupEvaluationsByDate,
  filterEvaluations,
  compareEvaluationsAsc,
  nextEvaluations,
  isVisibleToStudents,
} from "@/lib/evaluations/listing";
import type { EvaluationView } from "@/lib/evaluations/constants";

// ---------------------------------------------------------------------------
// Tests listing — logique d'affichage du module Évaluations (pures).
//  Les dates sont "YYYY-MM-DD" : comparaisons lexicographiques, sans fuseau.
//  Les évaluations ANNULÉES restent visibles (les étudiants doivent le savoir).
// ---------------------------------------------------------------------------

function ev(over: Partial<EvaluationView> & { id: string }): EvaluationView {
  return {
    subjectId: "sub-1",
    title: "Évaluation",
    type: "CC",
    date: "2026-06-15",
    startTime: null,
    endTime: null,
    room: null,
    status: "PUBLISHED",
    rescheduledFrom: null,
    ...over,
  };
}

describe("partitionEvaluations", () => {
  const today = "2026-06-15";

  it("sépare aujourd'hui/inclusif des évaluations passées", () => {
    const { upcoming, past } = partitionEvaluations(
      [ev({ id: "a", date: "2026-06-14" }), ev({ id: "b", date: today }), ev({ id: "c", date: "2026-06-16" })],
      today
    );
    expect(upcoming.map((e) => e.id)).toEqual(["b", "c"]);
    expect(past.map((e) => e.id)).toEqual(["a"]);
  });

  it("trie les évaluations à venir chronologiquement (heures avant non horodatées)", () => {
    const { upcoming } = partitionEvaluations(
      [
        ev({ id: "nohour", date: today }),
        ev({ id: "late", date: today, startTime: "14:00" }),
        ev({ id: "early", date: today, startTime: "08:00" }),
      ],
      today
    );
    expect(upcoming.map((e) => e.id)).toEqual(["early", "late", "nohour"]);
  });

  it("trie les passées de la plus récente à la plus ancienne", () => {
    const { past } = partitionEvaluations(
      [ev({ id: "old", date: "2026-06-01" }), ev({ id: "recent", date: "2026-06-14" })],
      today
    );
    expect(past.map((e) => e.id)).toEqual(["recent", "old"]);
  });
});

describe("groupEvaluationsByDate", () => {
  it("regroupe par date en préservant l'ordre chronologique", () => {
    const sorted = [
      ev({ id: "a", date: "2026-06-15", startTime: "08:00" }),
      ev({ id: "b", date: "2026-06-15", startTime: "10:00" }),
      ev({ id: "c", date: "2026-06-17" }),
    ];
    const groups = groupEvaluationsByDate(sorted);
    expect(groups).toHaveLength(2);
    expect(groups[0]?.date).toBe("2026-06-15");
    expect(groups[0]?.items.map((e) => e.id)).toEqual(["a", "b"]);
    expect(groups[1]?.date).toBe("2026-06-17");
  });

  it("retourne un tableau vide sans évaluation", () => {
    expect(groupEvaluationsByDate([])).toEqual([]);
  });
});

describe("filterEvaluations", () => {
  const list = [
    ev({ id: "a", subjectId: "s1", type: "CC" }),
    ev({ id: "b", subjectId: "s2", type: "EXAMEN" }),
  ];

  it("filtre par matière", () => {
    expect(filterEvaluations(list, { subjectId: "s1" }).map((e) => e.id)).toEqual(["a"]);
  });

  it("filtre par type", () => {
    expect(filterEvaluations(list, { type: "EXAMEN" }).map((e) => e.id)).toEqual(["b"]);
  });

  it("sans filtre, la liste est inchangée", () => {
    expect(filterEvaluations(list, {})).toHaveLength(2);
    expect(filterEvaluations(list, { subjectId: "", type: "" })).toHaveLength(2);
  });
});

describe("isVisibleToStudents", () => {
  it("un brouillon n'est jamais visible", () => {
    expect(isVisibleToStudents("DRAFT")).toBe(false);
  });

  it("les évaluations publiées ET annulées restent visibles", () => {
    expect(isVisibleToStudents("PUBLISHED")).toBe(true);
    expect(isVisibleToStudents("CANCELLED")).toBe(true);
  });
});

describe("nextEvaluations", () => {
  it("ne retourne que les évaluations publiées, à venir, tronquées", () => {
    const list = [
      ev({ id: "draft", status: "DRAFT", date: "2026-06-16" }),
      ev({ id: "cancelled", status: "CANCELLED", date: "2026-06-16" }),
      ev({ id: "past", date: "2026-06-10" }),
      ev({ id: "p1", date: "2026-06-15" }),
      ev({ id: "p2", date: "2026-06-17" }),
      ev({ id: "p3", date: "2026-06-18" }),
    ];
    const next = nextEvaluations(list, "2026-06-15", 2);
    expect(next.map((e) => e.id)).toEqual(["p1", "p2"]);
  });

  it("retourne un tableau vide sans évaluation publiée à venir", () => {
    expect(nextEvaluations([ev({ id: "d", status: "DRAFT" })], "2026-06-15")).toEqual([]);
  });
});

describe("compareEvaluationsAsc — déterministe", () => {
  it("utilise l'identifiant en dernier recours (même date et même heure)", () => {
    const a = ev({ id: "aaa", startTime: "08:00" });
    const b = ev({ id: "bbb", startTime: "08:00" });
    expect(compareEvaluationsAsc(a, b)).toBeLessThan(0);
    expect(compareEvaluationsAsc(b, a)).toBeGreaterThan(0);
    expect(compareEvaluationsAsc(a, a)).toBe(0);
  });
});
