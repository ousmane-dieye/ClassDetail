import { describe, it, expect } from "vitest";
import {
  DEFAULT_RECORDING_SORT,
  RECORDING_SORT_OPTIONS,
  applyRecordingLibrary,
  filterRecordings,
  formatRecordingCount,
  isRecordingSortKey,
  matchesRecordingQuery,
  normalizeSearchText,
  resolveRecordingLibraryState,
  sortRecordings,
  type RecordingListItem,
  type RecordingSortKey,
} from "@/lib/recordings/listing";

// ---------------------------------------------------------------------------
// Tests listing — logique d'affichage du module « Cours enregistrés » (pures).
//  Recherche locale insensible à la casse / aux accents sur titre + matière +
//  description, 4 tris déterministes, combinaison recherche + tri, états UI.
// ---------------------------------------------------------------------------

function rec(over: Partial<RecordingListItem> & { id: string }): RecordingListItem {
  return {
    title: "Cours",
    description: null,
    date: "2026-03-01",
    createdAt: "2026-03-01T09:00:00.000Z",
    driveUrl: "https://drive.example/vid",
    subjectName: null,
    ...over,
  };
}

const LIBRARY: RecordingListItem[] = [
  rec({
    id: "r1",
    title: "Algorithmique — Complexité",
    subjectName: "Informatique",
    description: "Récursivité et découpage",
    date: "2026-05-12",
    createdAt: "2026-05-12T10:00:00.000Z",
  }),
  rec({
    id: "r2",
    title: "Évaluation finale",
    subjectName: "Mathématiques",
    description: "Programme complet de la séance",
    date: "2026-05-20",
    createdAt: "2026-05-20T08:00:00.000Z",
  }),
  rec({
    id: "r3",
    title: "Optique ondulatoire",
    subjectName: "Physique",
    description: "Interférences et diffraction",
    date: "2026-05-20",
    createdAt: "2026-05-20T09:00:00.000Z",
  }),
];

const ids = (list: RecordingListItem[]) => list.map((r) => r.id);

/* ───────────────────────── Normalisation ───────────────────────── */

describe("normalizeSearchText", () => {
  it("réduit la casse", () => {
    expect(normalizeSearchText("ALGORITHME")).toBe("algorithme");
    expect(normalizeSearchText("Algorithme")).toBe("algorithme");
  });

  it("supprime les accents (et rend la recherche insensible aux accents)", () => {
    expect(normalizeSearchText("Évaluation Finale")).toBe("evaluation finale");
    expect(normalizeSearchText("Mathématiques")).toBe("mathematiques");
    expect(normalizeSearchText("Optique")).toBe("optique");
  });

  it("développe les ligatures et transforme les apostrophes en espaces", () => {
    expect(normalizeSearchText("Cœur d’âme")).toBe("coeur d ame");
    expect(normalizeSearchText("L'algorithme")).toBe("l algorithme");
  });

  it("écrase les espaces superflus", () => {
    expect(normalizeSearchText("  cours   public  ")).toBe("cours public");
  });
});

/* ──────────────────────────── Recherche ──────────────────────────── */

describe("filterRecordings — recherche", () => {
  it("retrouve un cours par son titre, quelle que soit la casse", () => {
    expect(ids(filterRecordings(LIBRARY, "eVALUATION"))).toEqual(["r2"]);
    expect(ids(filterRecordings(LIBRARY, "OPTIQUE"))).toEqual(["r3"]);
  });

  it("retrouve un cours par son titre avec ou sans accent", () => {
    expect(ids(filterRecordings(LIBRARY, "evaluation"))).toEqual(["r2"]);
    expect(ids(filterRecordings(LIBRARY, "Évaluation"))).toEqual(["r2"]);
    expect(ids(filterRecordings(LIBRARY, "complexite"))).toEqual(["r1"]);
    expect(ids(filterRecordings(LIBRARY, "Complexité"))).toEqual(["r1"]);
  });

  it("retrouve un cours par le nom de sa matière", () => {
    expect(ids(filterRecordings(LIBRARY, "mathematiques"))).toEqual(["r2"]);
    expect(ids(filterRecordings(LIBRARY, "MATHÉMATIQUES"))).toEqual(["r2"]);
    expect(ids(filterRecordings(LIBRARY, "physique"))).toEqual(["r3"]);
    expect(ids(filterRecordings(LIBRARY, "informatique"))).toEqual(["r1"]);
  });

  it("retrouve un cours par sa description", () => {
    expect(ids(filterRecordings(LIBRARY, "DIFFRACTION"))).toEqual(["r3"]);
    expect(ids(filterRecordings(LIBRARY, "recursivite"))).toEqual(["r1"]);
    expect(ids(filterRecordings(LIBRARY, "Récursivité"))).toEqual(["r1"]);
  });

  it("combine plusieurs mots répartis sur titre et matière", () => {
    expect(ids(filterRecordings(LIBRARY, "algorithmique informatique"))).toEqual(["r1"]);
    expect(ids(filterRecordings(LIBRARY, "evaluation math"))).toEqual(["r2"]);
  });

  it("tolère une racine commune longue : « algorithme » retrouve « Algorithmique »", () => {
    expect(ids(filterRecordings(LIBRARY, "algorithme"))).toEqual(["r1"]);
    expect(ids(filterRecordings(LIBRARY, "ALGORITHME"))).toEqual(["r1"]);
  });

  it("reste sélectif : « complet » ne ratisse pas « complexité »", () => {
    expect(ids(filterRecordings(LIBRARY, "complet"))).toEqual(["r2"]);
  });

  it("recherche vide ou blanche → tous les cours", () => {
    expect(ids(filterRecordings(LIBRARY, ""))).toEqual(["r1", "r2", "r3"]);
    expect(ids(filterRecordings(LIBRARY, "   "))).toEqual(["r1", "r2", "r3"]);
  });

  it("aucun résultat → liste vide", () => {
    expect(filterRecordings(LIBRARY, "zzz-aucun-cours")).toEqual([]);
    expect(filterRecordings([], "algorithme")).toEqual([]);
  });

  it("matchesRecordingQuery : une recherche vide correspond toujours", () => {
    expect(matchesRecordingQuery(LIBRARY[0]!, "")).toBe(true);
    expect(matchesRecordingQuery(LIBRARY[0]!, "algorithme")).toBe(true);
    expect(matchesRecordingQuery(LIBRARY[0]!, "chirurgie")).toBe(false);
  });
});

/* ─────────────────────────────── Tri ─────────────────────────────── */

describe("RECORDING_SORT_OPTIONS", () => {
  it("propose exactement les 4 options attendues", () => {
    expect(RECORDING_SORT_OPTIONS.map((o) => o.label)).toEqual([
      "Plus récents",
      "Plus anciens",
      "Titre : A → Z",
      "Titre : Z → A",
    ]);
    expect(DEFAULT_RECORDING_SORT).toBe("date_desc");
  });

  it("valide ou rejette une clé de tri", () => {
    expect(isRecordingSortKey("date_desc")).toBe(true);
    expect(isRecordingSortKey("title_asc")).toBe(true);
    expect(isRecordingSortKey("relevance")).toBe(false);
    expect(isRecordingSortKey(undefined)).toBe(false);
  });
});

describe("sortRecordings — dates de séance", () => {
  it("« Plus récents » : date de séance décroissante", () => {
    expect(ids(sortRecordings(LIBRARY, "date_desc"))).toEqual(["r3", "r2", "r1"]);
  });

  it("« Plus anciens » : date de séance croissante", () => {
    expect(ids(sortRecordings(LIBRARY, "date_asc"))).toEqual(["r1", "r2", "r3"]);
  });

  it("à date égale : horodatage de publication (jamais confondu avec la date)", () => {
    const sameDay = [
      rec({ id: "b", date: "2026-05-20", createdAt: "2026-05-21T12:00:00.000Z" }),
      rec({ id: "a", date: "2026-05-20", createdAt: "2026-05-20T12:00:00.000Z" }),
    ];
    // Récent d'abord : publication la plus tardive en tête.
    expect(ids(sortRecordings(sameDay, "date_desc"))).toEqual(["b", "a"]);
    expect(ids(sortRecordings(sameDay, "date_asc"))).toEqual(["a", "b"]);
  });

  it("égalité complète (même date, même publication) → départage par id, stable", () => {
    const tied = [
      rec({ id: "b", date: "2026-05-20", createdAt: "2026-05-20T08:00:00.000Z" }),
      rec({ id: "a", date: "2026-05-20", createdAt: "2026-05-20T08:00:00.000Z" }),
    ];
    expect(ids(sortRecordings(tied, "date_asc"))).toEqual(["a", "b"]);
    expect(ids(sortRecordings(tied, "date_desc"))).toEqual(["a", "b"]);
    expect(ids(sortRecordings(tied, "title_asc"))).toEqual(["a", "b"]);
    expect(ids(sortRecordings([...tied].reverse(), "date_desc"))).toEqual(["a", "b"]);
  });

  it("n'altère pas la liste d'origine et reste déterministe", () => {
    const input = [...LIBRARY];
    const first = ids(sortRecordings(input, "date_desc"));
    const second = ids(sortRecordings(input, "date_desc"));
    expect(ids(input)).toEqual(["r1", "r2", "r3"]);
    expect(second).toEqual(first);
    expect(sortRecordings(input, "date_desc")).not.toBe(input);
  });

  it("clé inconnue → repli sur le tri par défaut (plus récents)", () => {
    const unknown = "inconnu" as unknown as RecordingSortKey;
    expect(ids(sortRecordings(LIBRARY, unknown))).toEqual(
      ids(sortRecordings(LIBRARY, DEFAULT_RECORDING_SORT))
    );
  });
});

describe("sortRecordings — titres (A → Z / Z → A)", () => {
  const titles: RecordingListItem[] = [
    rec({ id: "t1", title: "Zoologie" }),
    rec({ id: "t2", title: "États-Unis" }),
    rec({ id: "t3", title: "algorithmique" }),
    rec({ id: "t4", title: "astronomie" }),
  ];

  it("ordre alphabétique insensible à la casse et aux accents", () => {
    expect(sortRecordings(titles, "title_asc").map((r) => r.title)).toEqual([
      "algorithmique",
      "astronomie",
      "États-Unis",
      "Zoologie",
    ]);
  });

  it("ordre alphabétique inverse", () => {
    expect(sortRecordings(titles, "title_desc").map((r) => r.title)).toEqual([
      "Zoologie",
      "États-Unis",
      "astronomie",
      "algorithmique",
    ]);
  });

  it("titres égaux → départage stable et identique à chaque exécution", () => {
    const tied = [
      rec({ id: "x", title: "Cours commun", date: "2026-01-05", createdAt: "2026-01-06T00:00:00.000Z" }),
      rec({ id: "y", title: "cours commun", date: "2026-02-05", createdAt: "2026-02-06T08:00:00.000Z" }),
      rec({ id: "z", title: "COURS COMMUN", date: "2026-02-05", createdAt: "2026-02-06T09:00:00.000Z" }),
    ];
    const asc = ids(sortRecordings(tied, "title_asc"));
    expect(asc).toEqual(ids(sortRecordings([...tied].reverse(), "title_asc")));
    expect(ids(sortRecordings(tied, "title_desc"))).toEqual(
      ids(sortRecordings([...tied].reverse(), "title_desc"))
    );
    // Départage : date de séance la plus récente d'abord (z avant y avant x).
    expect(asc).toEqual(["z", "y", "x"]);
  });
});

/* ───────────────────── Combinaison recherche + tri ───────────────────── */

describe("applyRecordingLibrary — recherche + tri combinés", () => {
  const items: RecordingListItem[] = [
    rec({ id: "c1", title: "Algorithmique avancée", date: "2026-01-10" }),
    rec({ id: "c2", title: "Algorithmique bases", date: "2026-04-01" }),
    rec({ id: "c3", title: "Optique", date: "2026-03-05" }),
  ];

  it("recherche « algorithme » + « Plus récents »", () => {
    expect(ids(applyRecordingLibrary(items, "algorithme", "date_desc"))).toEqual(["c2", "c1"]);
  });

  it("même recherche + « Titre : A → Z »", () => {
    expect(ids(applyRecordingLibrary(items, "algorithme", "title_asc"))).toEqual(["c1", "c2"]);
  });

  it("le tri est conservé quelle que soit la recherche", () => {
    const sorted = ids(applyRecordingLibrary(items, "", "date_desc"));
    expect(sorted).toEqual(["c2", "c3", "c1"]);
    expect(ids(applyRecordingLibrary(items, "optique", "date_desc"))).toEqual(
      sorted.filter((id) => id === "c3")
    );
    expect(ids(applyRecordingLibrary(items, "", "date_desc"))).toEqual(sorted);
  });

  it("recherche sans résultat → liste vide (tri inchangé en interne)", () => {
    expect(applyRecordingLibrary(items, "chirurgie", "title_asc")).toEqual([]);
  });
});

/* ───────────────────────────── États UI ───────────────────────────── */

describe("resolveRecordingLibraryState", () => {
  it("bibliothèque vide → « empty » (jamais un échec de recherche)", () => {
    expect(resolveRecordingLibraryState(0, 0)).toBe("empty");
  });

  it("des cours existent mais aucun ne correspond → « no-results »", () => {
    expect(resolveRecordingLibraryState(3, 0)).toBe("no-results");
  });

  it("au moins un cours correspond → « results »", () => {
    expect(resolveRecordingLibraryState(3, 2)).toBe("results");
    expect(resolveRecordingLibraryState(1, 1)).toBe("results");
  });
});

describe("formatRecordingCount", () => {
  it("sans recherche : total des cours enregistrés", () => {
    expect(formatRecordingCount(3, 3, false)).toBe("3 enregistrement(s)");
  });

  it("avec recherche : résultats distincts du total", () => {
    expect(formatRecordingCount(1, 3, true)).toBe("1 sur 3 résultat(s)");
    expect(formatRecordingCount(0, 3, true)).toBe("0 sur 3 résultat(s)");
  });
});
