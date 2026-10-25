import { describe, it, expect } from "vitest";
import {
  computeOverlapLayout,
  expandDay,
  expandWeek,
  groupByDate,
  nextOccurrence,
  ongoingOccurrences,
  sessionOccursOn,
  type Occurrence,
  type SessionException,
  type SessionRecurrence,
} from "@/lib/schedule/occurrences";

// ---------------------------------------------------------------------------
// Tests moteur d'occurrences — expansion récurrent + exceptions datées.
//  Semaine de référence : lundi 19 → dimanche 25 octobre 2026.
//  Les brouillons ne sont visibles que si `includeDrafts: true`
//  (délégués/admins ; la RLS filtre déjà côté base pour les étudiants).
// ---------------------------------------------------------------------------

const WEEK_START = "2026-10-19";
const WEDNESDAY = "2026-10-21";
const THURSDAY = "2026-10-22";

function session(over: Partial<SessionRecurrence> = {}): SessionRecurrence {
  return {
    id: "s1",
    classId: "c1",
    subjectId: "sub1",
    dayOfWeek: 3, // mercredi
    startTime: "08:00",
    endTime: "09:30",
    room: "Salle 1",
    teacher: "M. Ndiaye",
    validFrom: "2026-01-01",
    validUntil: null,
    status: "PUBLISHED",
    ...over,
  };
}

function exception(over: Partial<SessionException> = {}): SessionException {
  return {
    id: "x1",
    sessionId: "s1",
    date: WEDNESDAY,
    isCancelled: false,
    newStartTime: null,
    newEndTime: null,
    newRoom: null,
    newSubjectId: null,
    note: null,
    ...over,
  };
}

describe("sessionOccursOn", () => {
  it("s'applique le bon jour ISO dans la semaine", () => {
    const s = session();
    expect(sessionOccursOn(s, WEDNESDAY)).toBe(true);
    expect(sessionOccursOn(s, "2026-10-20")).toBe(false);
    expect(sessionOccursOn(s, "2026-10-25")).toBe(false); // dimanche (jour ISO 7)
  });

  it("respecte les bornes de validité (inclusives)", () => {
    expect(sessionOccursOn(session({ validFrom: WEDNESDAY }), WEDNESDAY)).toBe(true);
    expect(sessionOccursOn(session({ validFrom: THURSDAY }), WEDNESDAY)).toBe(false);
    expect(sessionOccursOn(session({ validUntil: WEDNESDAY }), WEDNESDAY)).toBe(true);
    expect(sessionOccursOn(session({ validUntil: "2026-10-20" }), WEDNESDAY)).toBe(false);
    expect(sessionOccursOn(session({ validFrom: "2026-10-01", validUntil: "2026-10-31" }), WEDNESDAY)).toBe(true);
  });
});

describe("expandWeek", () => {
  it("déplie une séance récurrente une fois par semaine", () => {
    const occs = expandWeek([session()], [], WEEK_START);
    expect(occs).toHaveLength(1);
    const o = occs[0]!;
    expect(o.date).toBe(WEDNESDAY);
    expect(o.key).toBe("s1:2026-10-21");
    expect(o.startMinutes).toBe(8 * 60);
    expect(o.endMinutes).toBe(9 * 60 + 30);
    expect(o.kind).toBe("normal");
    expect(o.cancelled).toBe(false);
    expect(o.exceptionId).toBeNull();
    expect(o.room).toBe("Salle 1");
    expect(o.teacher).toBe("M. Ndiaye");
    expect(o.status).toBe("PUBLISHED");
  });

  it("retourne une liste vide quand rien n'a lieu cette semaine-là", () => {
    expect(expandWeek([], [], WEEK_START)).toHaveLength(0);
    // Séance le mardi : rien le mercredi de cette semaine… mais une occurrence mardi.
    const tuesday = session({ id: "s2", dayOfWeek: 2 });
    const occs = expandWeek([tuesday], [], WEEK_START);
    expect(occs).toHaveLength(1);
    expect(occs[0]!.date).toBe("2026-10-20");
    // Semaine suivante sans séance valide.
    expect(expandWeek([session({ validUntil: "2026-10-01" })], [], WEEK_START)).toHaveLength(0);
  });

  it("masque les brouillons par défaut et les affiche avec includeDrafts", () => {
    const draft = session({ status: "DRAFT" });
    const published = session({ id: "s2", dayOfWeek: 3, startTime: "10:00", endTime: "11:00" });
    const students = expandWeek([draft, published], [], WEEK_START);
    expect(students).toHaveLength(1);
    expect(students[0]!.status).toBe("PUBLISHED");

    const managers = expandWeek([draft, published], [], WEEK_START, { includeDrafts: true });
    expect(managers).toHaveLength(2);
    expect(managers.map((o) => o.status).sort()).toEqual(["DRAFT", "PUBLISHED"]);
  });

  it("trie les occurrences chronologiquement (date puis heure)", () => {
    const late = session({ id: "sA", dayOfWeek: 3, startTime: "14:00", endTime: "15:00" });
    const early = session({ id: "sB", dayOfWeek: 3, startTime: "08:00", endTime: "09:00" });
    const otherDay = session({ id: "sC", dayOfWeek: 5, startTime: "08:00", endTime: "09:00" });
    const occs = expandWeek([late, otherDay, early], [], WEEK_START);
    expect(occs.map((o) => [o.date, o.startMinutes])).toEqual([
      [WEDNESDAY, 8 * 60],
      [WEDNESDAY, 14 * 60],
      ["2026-10-23", 8 * 60], // vendredi
    ]);
  });
});

describe("expandWeek — exceptions datées", () => {
  it("annule l'occurrence concernée et les autres restent intactes", () => {
    const weekly = session();
    const cancel = exception({ isCancelled: true });
    const occs = expandWeek([weekly], [cancel], WEEK_START);
    expect(occs).toHaveLength(1);
    expect(occs[0]!.cancelled).toBe(true);
    expect(occs[0]!.kind).toBe("cancelled");
    expect(occs[0]!.exceptionId).toBe("x1");
    // La semaine suivante : pas d'exception, le cours revient.
    const next = expandWeek([weekly], [cancel], "2026-10-26");
    expect(next[0]!.cancelled).toBe(false);
    expect(next[0]!.kind).toBe("normal");
  });

  it("déplace l'occurrence (nouveaux horaires)", () => {
    const moved = exception({ newStartTime: "10:00", newEndTime: "11:30" });
    const occs = expandWeek([session()], [moved], WEEK_START);
    expect(occs[0]!.startMinutes).toBe(10 * 60);
    expect(occs[0]!.endMinutes).toBe(11 * 60 + 30);
    expect(occs[0]!.kind).toBe("moved");
    expect(occs[0]!.cancelled).toBe(false);
  });

  it("change la salle (nouvelle salle conservée, sinon l'ancienne)", () => {
    const roomOnly = exception({ newRoom: "Amphi B" });
    const occs = expandWeek([session()], [roomOnly], WEEK_START);
    expect(occs[0]!.room).toBe("Amphi B");
    expect(occs[0]!.kind).toBe("room_changed");

    const both = exception({ newStartTime: "10:00", newEndTime: "11:30", newRoom: "Amphi C" });
    const occsBoth = expandWeek([session()], [both], WEEK_START);
    expect(occsBoth[0]!.kind).toBe("moved_room");
    expect(occsBoth[0]!.room).toBe("Amphi C");

    const noRoom = exception({ newRoom: null, newStartTime: "10:00", newEndTime: "11:00" });
    const occsNoRoom = expandWeek([session()], [noRoom], WEEK_START);
    expect(occsNoRoom[0]!.room).toBe("Salle 1"); // salle d'origine conservée
  });

  it("remplace la matière via newSubjectId", () => {
    const swap = exception({ newSubjectId: "sub2" });
    const occs = expandWeek([session()], [swap], WEEK_START);
    expect(occs[0]!.subjectId).toBe("sub2");
    expect(occs[0]!.kind).toBe("replaced");
  });

  it("ignore une exception posée sur une date où la séance n'a pas lieu", () => {
    const stray = exception({ date: "2026-10-20", isCancelled: true }); // mardi, séance mercredi
    const occs = expandWeek([session()], [stray], WEEK_START);
    expect(occs).toHaveLength(1);
    expect(occs[0]!.kind).toBe("normal");
    expect(occs[0]!.cancelled).toBe(false);
  });

  it("n'applique pas l'exception d'une autre séance au même jour", () => {
    const otherSessionException = exception({ id: "x2", sessionId: "autre", isCancelled: true });
    const occs = expandWeek([session()], [otherSessionException], WEEK_START);
    expect(occs[0]!.kind).toBe("normal");
    expect(occs[0]!.cancelled).toBe(false);
  });

  it("conserve la note de l'exception", () => {
    const noted = exception({ isCancelled: true, note: "Examen blanc" });
    const occs = expandWeek([session()], [noted], WEEK_START);
    expect(occs[0]!.note).toBe("Examen blanc");
  });
});

describe("expandDay", () => {
  it("ne retourne que les occurrences du jour demandé", () => {
    const wed = session();
    const thu = session({ id: "s2", dayOfWeek: 4 });
    expect(expandDay([wed, thu], [], WEDNESDAY)).toHaveLength(1);
    expect(expandDay([wed, thu], [], WEDNESDAY)[0]!.date).toBe(WEDNESDAY);
    expect(expandDay([wed, thu], [], "2026-10-20")).toHaveLength(0);
  });

  it("applique les exceptions du jour (agenda mobile)", () => {
    const cancel = exception({ isCancelled: true });
    const occs = expandDay([session()], [cancel], WEDNESDAY);
    expect(occs).toHaveLength(1);
    expect(occs[0]!.cancelled).toBe(true);
  });

  it("respecte l'option includeDrafts", () => {
    const draft = session({ status: "DRAFT" });
    expect(expandDay([draft], [], WEDNESDAY)).toHaveLength(0);
    expect(expandDay([draft], [], WEDNESDAY, { includeDrafts: true })).toHaveLength(1);
  });
});

describe("groupByDate", () => {
  it("regroupe par date ISO (7 groupes max sur une semaine)", () => {
    const occs = expandWeek(
      [session(), session({ id: "s2", dayOfWeek: 3, startTime: "10:00", endTime: "11:00" }), session({ id: "s3", dayOfWeek: 5 })],
      [],
      WEEK_START
    );
    const groups = groupByDate(occs);
    expect(groups.size).toBe(2);
    expect(groups.get(WEDNESDAY)).toHaveLength(2);
    expect(groups.get("2026-10-23")).toHaveLength(1);
    expect(groups.size).toBeLessThanOrEqual(7);
  });
});

describe("nextOccurrence", () => {
  const occs = expandWeek(
    [
      session({ id: "sTue", dayOfWeek: 2, startTime: "08:00", endTime: "09:00" }),
      session({ id: "sWed", dayOfWeek: 3, startTime: "08:00", endTime: "09:00" }),
      session({ id: "sWed2", dayOfWeek: 3, startTime: "14:00", endTime: "15:00" }),
      session({ id: "sThu", dayOfWeek: 4, startTime: "09:00", endTime: "10:00" }),
    ],
    [exception({ id: "xC", sessionId: "sTue", date: "2026-10-20", isCancelled: true })],
    WEEK_START
  );

  it("retourne la séance suivante le même jour (heure >= instant donné)", () => {
    const next = nextOccurrence(occs, WEDNESDAY, 7 * 60);
    expect(next?.sessionId).toBe("sWed");
    const later = nextOccurrence(occs, WEDNESDAY, 9 * 60);
    expect(later?.sessionId).toBe("sWed2");
  });

  it("saute les séances déjà passées dans la journée", () => {
    const next = nextOccurrence(occs, WEDNESDAY, 15 * 60);
    expect(next?.sessionId).toBe("sThu"); // jeudi 09:00
  });

  it("saute les séances annulées", () => {
    const next = nextOccurrence(occs, "2026-10-20", 7 * 60);
    expect(next?.sessionId).toBe("sWed"); // annulation du mardi ignorée
  });

  it("retourne null sans aucune séance à venir", () => {
    expect(nextOccurrence([], WEDNESDAY, 0)).toBeNull();
    expect(nextOccurrence(occs, "2026-12-31", 23 * 60)).toBeNull();
  });
});

describe("ongoingOccurrences", () => {
  const occs = expandWeek([session()], [], WEEK_START); // 08:00 – 09:30

  it("détecte les cours en cours", () => {
    expect(ongoingOccurrences(occs, WEDNESDAY, 8 * 60 + 30)).toHaveLength(1);
    expect(ongoingOccurrences(occs, WEDNESDAY, 8 * 60)).toHaveLength(1); // début inclus
  });

  it("n'inclut pas les bornes de fin ni les autres jours", () => {
    expect(ongoingOccurrences(occs, WEDNESDAY, 9 * 60 + 30)).toHaveLength(0); // fin exclusive
    expect(ongoingOccurrences(occs, WEDNESDAY, 7 * 60)).toHaveLength(0);
    expect(ongoingOccurrences(occs, THURSDAY, 8 * 60 + 30)).toHaveLength(0);
  });

  it("exclut un cours annulé", () => {
    const cancelled = expandWeek([session()], [exception({ isCancelled: true })], WEEK_START);
    expect(ongoingOccurrences(cancelled, WEDNESDAY, 8 * 60 + 30)).toHaveLength(0);
  });
});

describe("computeOverlapLayout", () => {
  function occ(key: string, date: string, start: number, end: number): Occurrence {
    return {
      key,
      sessionId: key,
      exceptionId: null,
      date,
      dayOfWeek: 3,
      startMinutes: start,
      endMinutes: end,
      subjectId: "sub1",
      room: null,
      teacher: null,
      cancelled: false,
      kind: "normal",
      note: null,
      status: "PUBLISHED",
    };
  }

  it("répartit deux occurrences qui se chevauchent sur 2 colonnes", () => {
    const layout = computeOverlapLayout([
      occ("a", WEDNESDAY, 480, 570),
      occ("b", WEDNESDAY, 540, 660),
    ]);
    expect(layout.get("a")).toEqual({ col: 0, cols: 2 });
    expect(layout.get("b")).toEqual({ col: 1, cols: 2 });
  });

  it("laisse les cours consécutifs en pleine largeur (fin = début)", () => {
    const layout = computeOverlapLayout([
      occ("a", WEDNESDAY, 480, 600),
      occ("b", WEDNESDAY, 600, 720),
    ]);
    expect(layout.get("a")).toEqual({ col: 0, cols: 1 });
    expect(layout.get("b")).toEqual({ col: 0, cols: 1 });
  });

  it("propage la largeur de cluster (chevauchement transitif)", () => {
    const layout = computeOverlapLayout([
      occ("a", WEDNESDAY, 480, 600),
      occ("b", WEDNESDAY, 540, 660),
      occ("c", WEDNESDAY, 630, 690),
    ]);
    expect(layout.get("a")?.cols).toBe(2);
    expect(layout.get("b")?.cols).toBe(2);
    expect(layout.get("c")?.cols).toBe(2);
  });

  it("ne mélange pas les jours entre eux", () => {
    const layout = computeOverlapLayout([
      occ("mon", "2026-10-19", 480, 570),
      occ("mon2", "2026-10-19", 540, 660),
      occ("tue", "2026-10-20", 480, 570),
    ]);
    expect(layout.get("mon")?.cols).toBe(2);
    expect(layout.get("mon2")?.cols).toBe(2);
    expect(layout.get("tue")).toEqual({ col: 0, cols: 1 });
  });

  it("retourne une carte vide pour une liste vide", () => {
    expect(computeOverlapLayout([]).size).toBe(0);
  });
});
