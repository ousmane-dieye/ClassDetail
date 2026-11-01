import { describe, it, expect } from "vitest";
import {
  DEFAULT_HINT_SORT,
  HINT_SORT_OPTIONS,
  applyHintLibrary,
  filterHints,
  formatHintCount,
  isHintSortKey,
  matchesHintQuery,
  resolveHintLibraryState,
  sortHints,
  type HintListItem,
  type HintSortKey,
} from "@/lib/hints/listing";

// ---------------------------------------------------------------------------
// Tests listing — logique d'affichage du module « Hints & Sujets » (pures).
//  Recherche locale insensible à la casse / aux accents sur titre + matière +
//  type (`hint_type`) + année de promotion (les seuls champs réellement
//  disponibles en base : `hints` n'a pas de description), 4 tris déterministes
//  sur `year` puis `created_at`, combinaison recherche + tri, états UI.
// ---------------------------------------------------------------------------

function hint(over: Partial<HintListItem> & { id: string }): HintListItem {
  return {
    title: "Sujet",
    year: "2024-2025",
    type: "AUTRE",
    createdAt: "2026-03-01T09:00:00.000Z",
    driveUrl: "https://drive.example/hint",
    subjectName: null,
    canDelete: false,
    ...over,
  };
}

const LIBRARY: HintListItem[] = [
  hint({
    id: "h1",
    title: "Examen Final Algorithmique",
    subjectName: "Informatique",
    type: "EXAMEN",
    year: "2023-2024",
    createdAt: "2026-05-12T10:00:00.000Z",
  }),
  hint({
    id: "h2",
    title: "TD Mathématiques — Intégrales",
    subjectName: "Mathématiques",
    type: "DEVOIR",
    year: "2024-2025",
    createdAt: "2026-05-20T08:00:00.000Z",
  }),
  hint({
    id: "h3",
    title: "TP Physique — Ondes",
    subjectName: "Physique",
    type: "TP",
    year: "2024-2025",
    createdAt: "2026-05-20T09:00:00.000Z",
  }),
];

const ids = (list: HintListItem[]) => list.map((h) => h.id);

/* ──────────────────────────── Recherche ──────────────────────────── */

describe("filterHints — recherche", () => {
  it("retrouve un sujet par son titre, quelle que soit la casse", () => {
    expect(ids(filterHints(LIBRARY, "eXAMEN fINAL"))).toEqual(["h1"]);
    expect(ids(filterHints(LIBRARY, "oNDES"))).toEqual(["h3"]);
  });

  it("retrouve un sujet par son titre avec ou sans accent", () => {
    expect(ids(filterHints(LIBRARY, "mathematiques"))).toEqual(["h2"]);
    expect(ids(filterHints(LIBRARY, "Mathématiques"))).toEqual(["h2"]);
    expect(ids(filterHints(LIBRARY, "integrales"))).toEqual(["h2"]);
    expect(ids(filterHints(LIBRARY, "Intégrales"))).toEqual(["h2"]);
  });

  it("retrouve un sujet par le nom de sa matière", () => {
    expect(ids(filterHints(LIBRARY, "physique"))).toEqual(["h3"]);
    expect(ids(filterHints(LIBRARY, "PHYSIQUE"))).toEqual(["h3"]);
    expect(ids(filterHints(LIBRARY, "informatique"))).toEqual(["h1"]);
  });

  it("retrouve un sujet par son type de ressource (enum hint_type, normalisé)", () => {
    expect(ids(filterHints(LIBRARY, "examen"))).toEqual(["h1"]);
    expect(ids(filterHints(LIBRARY, "EXAMEN"))).toEqual(["h1"]);
    expect(ids(filterHints(LIBRARY, "devoir"))).toEqual(["h2"]);
    expect(ids(filterHints(LIBRARY, "tp"))).toEqual(["h3"]);
  });

  it("retrouve un sujet par son année de promotion", () => {
    expect(ids(filterHints(LIBRARY, "2023"))).toEqual(["h1"]);
    expect(ids(filterHints(LIBRARY, "2024-2025")).sort()).toEqual(["h2", "h3"]);
  });

  it("combine plusieurs mots répartis sur titre, type et matière", () => {
    expect(ids(filterHints(LIBRARY, "examen algorithmique"))).toEqual(["h1"]);
    expect(ids(filterHints(LIBRARY, "tp physique"))).toEqual(["h3"]);
    expect(ids(filterHints(LIBRARY, "devoir math"))).toEqual(["h2"]);
  });

  it("tolère une racine commune longue : « algorithme » retrouve « Algorithmique »", () => {
    expect(ids(filterHints(LIBRARY, "algorithme"))).toEqual(["h1"]);
    expect(ids(filterHints(LIBRARY, "ALGORITHME"))).toEqual(["h1"]);
  });

  it("recherche vide ou blanche → tous les sujets", () => {
    expect(ids(filterHints(LIBRARY, ""))).toEqual(["h1", "h2", "h3"]);
    expect(ids(filterHints(LIBRARY, "   "))).toEqual(["h1", "h2", "h3"]);
  });

  it("aucun résultat → liste vide", () => {
    expect(filterHints(LIBRARY, "zzz-aucun-sujet")).toEqual([]);
    expect(filterHints([], "examen")).toEqual([]);
  });

  it("matchesHintQuery : une recherche vide correspond toujours", () => {
    expect(matchesHintQuery(LIBRARY[0]!, "")).toBe(true);
    expect(matchesHintQuery(LIBRARY[0]!, "examen")).toBe(true);
    expect(matchesHintQuery(LIBRARY[0]!, "chirurgie")).toBe(false);
  });
});

/* ─────────────────────────────── Tri ─────────────────────────────── */

describe("HINT_SORT_OPTIONS", () => {
  it("propose exactement les 4 options attendues", () => {
    expect(HINT_SORT_OPTIONS.map((o) => o.label)).toEqual([
      "Plus récents",
      "Plus anciens",
      "Titre : A → Z",
      "Titre : Z → A",
    ]);
    expect(DEFAULT_HINT_SORT).toBe("date_desc");
  });

  it("valide ou rejette une clé de tri", () => {
    expect(isHintSortKey("date_desc")).toBe(true);
    expect(isHintSortKey("title_asc")).toBe(true);
    expect(isHintSortKey("relevance")).toBe(false);
    expect(isHintSortKey(undefined)).toBe(false);
  });
});

describe("sortHints — année de promotion", () => {
  it("« Plus récents » : promotion la plus récente d'abord", () => {
    // h2 et h3 (2024-2025) avant h1 (2023-2024) — jamais l'ajout en base.
    expect(ids(sortHints(LIBRARY, "date_desc"))).toEqual(["h3", "h2", "h1"]);
  });

  it("« Plus anciens » : promotion la plus ancienne d'abord", () => {
    expect(ids(sortHints(LIBRARY, "date_asc"))).toEqual(["h1", "h2", "h3"]);
  });

  it("à promotion égale : horodatage d'ajout (départage, jamais confondu avec year)", () => {
    const sameYear = [
      hint({ id: "b", year: "2024-2025", createdAt: "2026-05-21T12:00:00.000Z" }),
      hint({ id: "a", year: "2024-2025", createdAt: "2026-05-20T12:00:00.000Z" }),
    ];
    expect(ids(sortHints(sameYear, "date_desc"))).toEqual(["b", "a"]);
    expect(ids(sortHints(sameYear, "date_asc"))).toEqual(["a", "b"]);
  });

  it("égalité complète (même promotion, même ajout) → départage par id, stable", () => {
    const tied = [
      hint({ id: "b", year: "2024-2025", createdAt: "2026-05-20T08:00:00.000Z" }),
      hint({ id: "a", year: "2024-2025", createdAt: "2026-05-20T08:00:00.000Z" }),
    ];
    expect(ids(sortHints(tied, "date_asc"))).toEqual(["a", "b"]);
    expect(ids(sortHints(tied, "date_desc"))).toEqual(["a", "b"]);
    expect(ids(sortHints([...tied].reverse(), "date_desc"))).toEqual(["a", "b"]);
  });

  it("n'altère pas la liste d'origine et reste déterministe", () => {
    const input = [...LIBRARY];
    const first = ids(sortHints(input, "date_desc"));
    const second = ids(sortHints(input, "date_desc"));
    expect(ids(input)).toEqual(["h1", "h2", "h3"]);
    expect(second).toEqual(first);
    expect(sortHints(input, "date_desc")).not.toBe(input);
  });

  it("clé inconnue → repli sur le tri par défaut (plus récents)", () => {
    const unknown = "inconnu" as unknown as HintSortKey;
    expect(ids(sortHints(LIBRARY, unknown))).toEqual(
      ids(sortHints(LIBRARY, DEFAULT_HINT_SORT))
    );
  });
});

describe("sortHints — titres (A → Z / Z → A)", () => {
  const titles: HintListItem[] = [
    hint({ id: "t1", title: "Zoologie" }),
    hint({ id: "t2", title: "États-Unis" }),
    hint({ id: "t3", title: "algorithmique" }),
    hint({ id: "t4", title: "astronomie" }),
  ];

  it("ordre alphabétique insensible à la casse et aux accents", () => {
    expect(sortHints(titles, "title_asc").map((h) => h.title)).toEqual([
      "algorithmique",
      "astronomie",
      "États-Unis",
      "Zoologie",
    ]);
  });

  it("ordre alphabétique inverse", () => {
    expect(sortHints(titles, "title_desc").map((h) => h.title)).toEqual([
      "Zoologie",
      "États-Unis",
      "astronomie",
      "algorithmique",
    ]);
  });

  it("titres égaux → départage stable et identique à chaque exécution", () => {
    const tied = [
      hint({ id: "x", title: "Sujet commun", year: "2023-2024", createdAt: "2026-01-06T00:00:00.000Z" }),
      hint({ id: "y", title: "sujet commun", year: "2024-2025", createdAt: "2026-02-06T08:00:00.000Z" }),
      hint({ id: "z", title: "SUJET COMMUN", year: "2024-2025", createdAt: "2026-02-06T09:00:00.000Z" }),
    ];
    const asc = ids(sortHints(tied, "title_asc"));
    expect(asc).toEqual(ids(sortHints([...tied].reverse(), "title_asc")));
    expect(ids(sortHints(tied, "title_desc"))).toEqual(
      ids(sortHints([...tied].reverse(), "title_desc"))
    );
    // Départage : promotion la plus récente d'abord (z avant y avant x).
    expect(asc).toEqual(["z", "y", "x"]);
  });
});

/* ───────────────────── Combinaison recherche + tri ───────────────────── */

describe("applyHintLibrary — recherche + tri combinés", () => {
  const items: HintListItem[] = [
    hint({ id: "c1", title: "Algorithmique avancée", year: "2022-2023" }),
    hint({ id: "c2", title: "Algorithmique bases", year: "2024-2025" }),
    hint({ id: "c3", title: "Optique", year: "2023-2024" }),
  ];

  it("recherche « algorithme » + « Plus récents »", () => {
    expect(ids(applyHintLibrary(items, "algorithme", "date_desc"))).toEqual(["c2", "c1"]);
  });

  it("même recherche + « Titre : A → Z »", () => {
    expect(ids(applyHintLibrary(items, "algorithme", "title_asc"))).toEqual(["c1", "c2"]);
  });

  it("le tri est conservé quelle que soit la recherche", () => {
    const sorted = ids(applyHintLibrary(items, "", "date_desc"));
    expect(sorted).toEqual(["c2", "c3", "c1"]);
    expect(ids(applyHintLibrary(items, "optique", "date_desc"))).toEqual(
      sorted.filter((id) => id === "c3")
    );
    expect(ids(applyHintLibrary(items, "", "date_desc"))).toEqual(sorted);
  });

  it("recherche sans résultat → liste vide (tri inchangé en interne)", () => {
    expect(applyHintLibrary(items, "chirurgie", "title_asc")).toEqual([]);
  });
});

/* ───────────────────────────── États UI ───────────────────────────── */

describe("resolveHintLibraryState", () => {
  it("bibliothèque vide → « empty » (jamais un échec de recherche)", () => {
    expect(resolveHintLibraryState(0, 0)).toBe("empty");
  });

  it("des sujets existent mais aucun ne correspond → « no-results »", () => {
    expect(resolveHintLibraryState(3, 0)).toBe("no-results");
  });

  it("au moins un sujet correspond → « results »", () => {
    expect(resolveHintLibraryState(3, 2)).toBe("results");
    expect(resolveHintLibraryState(1, 1)).toBe("results");
  });
});

describe("formatHintCount", () => {
  it("sans recherche : total des sujets", () => {
    expect(formatHintCount(3, 3, false)).toBe("3 sujet(s)");
  });

  it("avec recherche : résultats distincts du total", () => {
    expect(formatHintCount(1, 3, true)).toBe("1 sur 3 résultat(s)");
    expect(formatHintCount(0, 3, true)).toBe("0 sur 3 résultat(s)");
  });
});

/* ─────────────────────── Permissions pré-calculées ─────────────────────── */

describe("HintListItem.canDelete", () => {
  it("la permission est transportée telle quelle (le client n'infère rien)", () => {
    expect(hint({ id: "p1", canDelete: false }).canDelete).toBe(false);
    expect(hint({ id: "p2", canDelete: true }).canDelete).toBe(true);
  });
});
