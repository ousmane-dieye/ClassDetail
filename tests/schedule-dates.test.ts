import { describe, it, expect } from "vitest";
import {
  APP_TIMEZONE,
  addDaysYmd,
  dayLongLabel,
  dayNumber,
  dayShortLabel,
  formatWeekRange,
  formatYmdCompact,
  formatYmdLong,
  getZonedNow,
  isoDayOfWeek,
  minutesToTime,
  nextWeekdayYmd,
  startOfWeekYmd,
  timeToMinutes,
  weekDaysYmd,
  ymdGte,
  ymdLte,
} from "@/lib/schedule/dates";

// ---------------------------------------------------------------------------
// Tests dates & fuseau — logique pure, sans DOM. Le fuseau de l'application
//  est Africa/Dakar (UTC+0 toute l'année, pas d'heure d'été) : les instants
//  ci-dessous sont exprimés en UTC pour être reproductibles partout.
// ---------------------------------------------------------------------------

describe("Fuseau de l'application", () => {
  it("utilise Africa/Dakar comme fuseau documenté", () => {
    expect(APP_TIMEZONE).toBe("Africa/Dakar");
  });

  it("getZonedNow convertit un instant UTC vers l'heure locale de Dakar", () => {
    // 23h30 UTC = 23h30 à Dakar, jeudi 15 janvier 2026.
    const late = getZonedNow(new Date("2026-01-15T23:30:00Z"));
    expect(late.todayYmd).toBe("2026-01-15");
    expect(late.dayOfWeek).toBe(4); // jeudi
    expect(late.minutesOfDay).toBe(23 * 60 + 30);
  });

  it("getZonedNow bascule sur le lendemain à minuit local", () => {
    const afterMidnight = getZonedNow(new Date("2026-01-16T00:30:00Z"));
    expect(afterMidnight.todayYmd).toBe("2026-01-16");
    expect(afterMidnight.dayOfWeek).toBe(5); // vendredi
    expect(afterMidnight.minutesOfDay).toBe(30);
  });

  it("getZonedNow reste cohérent en milieu de journée", () => {
    const noon = getZonedNow(new Date("2026-10-22T12:05:00Z"));
    expect(noon.todayYmd).toBe("2026-10-22");
    expect(noon.dayOfWeek).toBe(4); // jeudi 22 octobre 2026
    expect(noon.minutesOfDay).toBe(12 * 60 + 5);
  });
});

describe("Arithmétique de dates ISO", () => {
  it("isoDayOfWeek respecte la numérotation ISO (1 = lundi … 7 = dimanche)", () => {
    expect(isoDayOfWeek("2026-10-19")).toBe(1); // lundi
    expect(isoDayOfWeek("2026-10-22")).toBe(4); // jeudi
    expect(isoDayOfWeek("2026-10-25")).toBe(7); // dimanche
  });

  it("startOfWeekYmd ramène au lundi de la semaine", () => {
    expect(startOfWeekYmd("2026-10-22")).toBe("2026-10-19");
    expect(startOfWeekYmd("2026-10-19")).toBe("2026-10-19"); // déjà lundi
    expect(startOfWeekYmd("2026-10-25")).toBe("2026-10-19"); // dimanche → lundi -6
  });

  it("nextWeekdayYmd donne la prochaine occurrence (aujourd'hui inclus)", () => {
    // Scénario du bug corrigé : jeudi 22/10 → « lundi » = le lundi SUIVANT (26/10).
    expect(nextWeekdayYmd("2026-10-22", 1)).toBe("2026-10-26");
    // Aujourd'hui est ce jour → on reste sur aujourd'hui.
    expect(nextWeekdayYmd("2026-10-22", 4)).toBe("2026-10-22"); // jeudi
    // Dimanche → lundi = lendemain.
    expect(nextWeekdayYmd("2026-10-25", 1)).toBe("2026-10-26");
    // Lundi → dimanche = dans 6 jours.
    expect(nextWeekdayYmd("2026-10-19", 7)).toBe("2026-10-25");
  });

  it("addDaysYmd franchit mois et années sans dérive", () => {
    expect(addDaysYmd("2026-12-30", 5)).toBe("2027-01-04");
    expect(addDaysYmd("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDaysYmd("2024-02-28", 1)).toBe("2024-02-29"); // année bissextile
    expect(addDaysYmd("2026-02-28", 1)).toBe("2026-03-01"); // non bissextile
    expect(addDaysYmd("2026-10-19", 7)).toBe("2026-10-26");
  });

  it("weekDaysYmd retourne les 7 dates consécutives à partir du lundi", () => {
    const days = weekDaysYmd("2026-10-19");
    expect(days).toHaveLength(7);
    expect(days[0]).toBe("2026-10-19");
    expect(days[6]).toBe("2026-10-25");
    // Chaque jour est bien dans l'ordre ISO croissant.
    for (let i = 1; i < days.length; i++) {
      expect(days[i]! > days[i - 1]!).toBe(true);
    }
  });

  it("ymdLte / ymdGte comparent correctement les dates ISO", () => {
    expect(ymdLte("2026-10-19", "2026-10-19")).toBe(true);
    expect(ymdLte("2026-10-18", "2026-10-19")).toBe(true);
    expect(ymdLte("2026-10-20", "2026-10-19")).toBe(false);
    expect(ymdGte("2026-10-19", "2026-10-19")).toBe(true);
    expect(ymdGte("2026-10-18", "2026-10-19")).toBe(false);
  });
});

describe("Horaires", () => {
  it("timeToMinutes accepte « HH:MM » et « HH:MM:SS » (format PostgreSQL)", () => {
    expect(timeToMinutes("08:00")).toBe(480);
    expect(timeToMinutes("08:00:00")).toBe(480);
    expect(timeToMinutes("23:59:59")).toBe(23 * 60 + 59);
    expect(timeToMinutes("00:00")).toBe(0);
    expect(timeToMinutes("13:05")).toBe(13 * 60 + 5);
  });

  it("minutesToTime plafonne dans [00:00 ; 23:59]", () => {
    expect(minutesToTime(480)).toBe("08:00");
    expect(minutesToTime(0)).toBe("00:00");
    expect(minutesToTime(1439)).toBe("23:59");
    expect(minutesToTime(24 * 60 + 30)).toBe("23:59");
    expect(minutesToTime(-10)).toBe("00:00");
  });

  it("fait un aller-retour minutes ↔ heure sans perte", () => {
    for (const minutes of [0, 1, 75, 480, 725, 1199, 1439]) {
      expect(timeToMinutes(minutesToTime(minutes))).toBe(minutes);
    }
  });
});

describe("Libellés français", () => {
  it("dayShortLabel et dayLongLabel couvrent les 7 jours ISO", () => {
    expect(dayShortLabel(1)).toBe("Lun");
    expect(dayShortLabel(7)).toBe("Dim");
    expect(dayLongLabel(4)).toBe("jeudi");
    expect(dayLongLabel(7)).toBe("dimanche");
    // Hors plage : libellé vide, jamais un crash.
    expect(dayShortLabel(0)).toBe("");
    expect(dayLongLabel(8)).toBe("");
  });

  it("formatYmdLong formate « jeudi 22 octobre »", () => {
    expect(formatYmdLong("2026-10-22")).toMatch(/jeudi\s+22\s+octobre/);
    expect(formatYmdLong("2026-10-25")).toMatch(/dimanche\s+25\s+octobre/);
  });

  it("formatYmdCompact produit un libellé court daté", () => {
    const label = formatYmdCompact("2026-10-22");
    expect(label).toMatch(/jeu\./);
    expect(label).toMatch(/22/);
    expect(label).toMatch(/oct\./);
  });

  it("dayNumber retourne le jour du mois", () => {
    expect(dayNumber("2026-10-01")).toBe(1);
    expect(dayNumber("2026-12-31")).toBe(31);
  });
});

describe("formatWeekRange", () => {
  it("formatte une semaine dans un même mois", () => {
    expect(formatWeekRange("2026-10-19")).toBe("19 – 25 octobre 2026");
  });

  it("formatte une semaine à cheval sur deux mois", () => {
    expect(formatWeekRange("2026-10-26")).toBe("26 octobre – 1 novembre 2026");
  });

  it("formatte une semaine à cheval sur deux années", () => {
    expect(formatWeekRange("2026-12-28")).toBe("28 décembre 2026 – 3 janvier 2027");
  });
});
