import { describe, it, expect } from "vitest";
import {
  DEFAULT_DOCUMENT_SORT,
  DOCUMENT_SORT_OPTIONS,
  applyDocumentLibrary,
  filterDocuments,
  formatDocumentCount,
  isDocumentSortKey,
  matchesDocumentQuery,
  resolveDocumentLibraryState,
  sortDocuments,
  type DocumentListItem,
  type DocumentSortKey,
} from "@/lib/documents/listing";

// ---------------------------------------------------------------------------
// Tests listing — logique d'affichage du module « Documents » (pures).
//  Recherche locale insensible à la casse / aux accents sur titre + matière +
//  description (les seuls champs réellement disponibles en base), 4 tris
//  déterministes sur `created_at` (date de dépôt) et titre, combinaison
//  recherche + tri, états UI. Normalisation et racine commune partagées avec
//  « Cours enregistrés » (tests de référence : tests/recordings-listing.test.ts).
// ---------------------------------------------------------------------------

function doc(over: Partial<DocumentListItem> & { id: string }): DocumentListItem {
  return {
    title: "Document",
    description: null,
    createdAt: "2026-03-01T09:00:00.000Z",
    driveUrl: "https://drive.example/doc",
    subjectName: null,
    canDelete: false,
    ...over,
  };
}

const LIBRARY: DocumentListItem[] = [
  doc({
    id: "d1",
    title: "Polycopié Algorithmique",
    subjectName: "Informatique",
    description: "Récursivité et complexité",
    createdAt: "2026-05-12T10:00:00.000Z",
  }),
  doc({
    id: "d2",
    title: "TD Mathématiques — Intégrales",
    subjectName: "Mathématiques",
    description: "Exercices corrigés du programme complet",
    createdAt: "2026-05-20T08:00:00.000Z",
  }),
  doc({
    id: "d3",
    title: "Optique ondulatoire",
    subjectName: "Physique",
    description: "Interférences et diffraction",
    createdAt: "2026-05-20T09:00:00.000Z",
  }),
];

const ids = (list: DocumentListItem[]) => list.map((d) => d.id);

/* ──────────────────────────── Recherche ──────────────────────────── */

describe("filterDocuments — recherche", () => {
  it("retrouve un document par son titre, quelle que soit la casse", () => {
    expect(ids(filterDocuments(LIBRARY, "oPTIQUE"))).toEqual(["d3"]);
    expect(ids(filterDocuments(LIBRARY, "POLYCOPIE"))).toEqual(["d1"]);
  });

  it("retrouve un document par son titre avec ou sans accent", () => {
    expect(ids(filterDocuments(LIBRARY, "mathematiques"))).toEqual(["d2"]);
    expect(ids(filterDocuments(LIBRARY, "Mathématiques"))).toEqual(["d2"]);
    expect(ids(filterDocuments(LIBRARY, "integrales"))).toEqual(["d2"]);
    expect(ids(filterDocuments(LIBRARY, "Intégrales"))).toEqual(["d2"]);
  });

  it("retrouve un document par le nom de sa matière", () => {
    expect(ids(filterDocuments(LIBRARY, "physique"))).toEqual(["d3"]);
    expect(ids(filterDocuments(LIBRARY, "PHYSIQUE"))).toEqual(["d3"]);
    expect(ids(filterDocuments(LIBRARY, "informatique"))).toEqual(["d1"]);
  });

  it("retrouve un document par sa description", () => {
    expect(ids(filterDocuments(LIBRARY, "DIFFRACTION"))).toEqual(["d3"]);
    expect(ids(filterDocuments(LIBRARY, "recursivite"))).toEqual(["d1"]);
    expect(ids(filterDocuments(LIBRARY, "Récursivité"))).toEqual(["d1"]);
  });

  it("combine plusieurs mots répartis sur titre et matière", () => {
    expect(ids(filterDocuments(LIBRARY, "algorithmique informatique"))).toEqual(["d1"]);
    expect(ids(filterDocuments(LIBRARY, "td math"))).toEqual(["d2"]);
  });

  it("tolère une racine commune longue : « algorithme » retrouve « Algorithmique »", () => {
    expect(ids(filterDocuments(LIBRARY, "algorithme"))).toEqual(["d1"]);
    expect(ids(filterDocuments(LIBRARY, "ALGORITHME"))).toEqual(["d1"]);
  });

  it("recherche vide ou blanche → tous les documents", () => {
    expect(ids(filterDocuments(LIBRARY, ""))).toEqual(["d1", "d2", "d3"]);
    expect(ids(filterDocuments(LIBRARY, "   "))).toEqual(["d1", "d2", "d3"]);
  });

  it("aucun résultat → liste vide", () => {
    expect(filterDocuments(LIBRARY, "zzz-aucun-document")).toEqual([]);
    expect(filterDocuments([], "algorithmique")).toEqual([]);
  });

  it("matchesDocumentQuery : une recherche vide correspond toujours", () => {
    expect(matchesDocumentQuery(LIBRARY[0]!, "")).toBe(true);
    expect(matchesDocumentQuery(LIBRARY[0]!, "algorithme")).toBe(true);
    expect(matchesDocumentQuery(LIBRARY[0]!, "chirurgie")).toBe(false);
  });
});

/* ─────────────────────────────── Tri ─────────────────────────────── */

describe("DOCUMENT_SORT_OPTIONS", () => {
  it("propose exactement les 4 options attendues", () => {
    expect(DOCUMENT_SORT_OPTIONS.map((o) => o.label)).toEqual([
      "Plus récents",
      "Plus anciens",
      "Titre : A → Z",
      "Titre : Z → A",
    ]);
    expect(DEFAULT_DOCUMENT_SORT).toBe("date_desc");
  });

  it("valide ou rejette une clé de tri", () => {
    expect(isDocumentSortKey("date_desc")).toBe(true);
    expect(isDocumentSortKey("title_asc")).toBe(true);
    expect(isDocumentSortKey("relevance")).toBe(false);
    expect(isDocumentSortKey(undefined)).toBe(false);
  });
});

describe("sortDocuments — date de dépôt (created_at)", () => {
  it("« Plus récents » : date de dépôt décroissante", () => {
    expect(ids(sortDocuments(LIBRARY, "date_desc"))).toEqual(["d3", "d2", "d1"]);
  });

  it("« Plus anciens » : date de dépôt croissante", () => {
    expect(ids(sortDocuments(LIBRARY, "date_asc"))).toEqual(["d1", "d2", "d3"]);
  });

  it("égalité de date de dépôt → départage par identifiant, stable", () => {
    const tied = [
      doc({ id: "b", createdAt: "2026-05-20T09:00:00.000Z" }),
      doc({ id: "a", createdAt: "2026-05-20T09:00:00.000Z" }),
    ];
    expect(ids(sortDocuments(tied, "date_asc"))).toEqual(["a", "b"]);
    expect(ids(sortDocuments(tied, "date_desc"))).toEqual(["a", "b"]);
    expect(ids(sortDocuments([...tied].reverse(), "date_desc"))).toEqual(["a", "b"]);
  });

  it("n'altère pas la liste d'origine et reste déterministe", () => {
    const input = [...LIBRARY];
    const first = ids(sortDocuments(input, "date_desc"));
    const second = ids(sortDocuments(input, "date_desc"));
    expect(ids(input)).toEqual(["d1", "d2", "d3"]);
    expect(second).toEqual(first);
    expect(sortDocuments(input, "date_desc")).not.toBe(input);
  });

  it("clé inconnue → repli sur le tri par défaut (plus récents)", () => {
    const unknown = "inconnu" as unknown as DocumentSortKey;
    expect(ids(sortDocuments(LIBRARY, unknown))).toEqual(
      ids(sortDocuments(LIBRARY, DEFAULT_DOCUMENT_SORT))
    );
  });
});

describe("sortDocuments — titres (A → Z / Z → A)", () => {
  const titles: DocumentListItem[] = [
    doc({ id: "t1", title: "Zoologie" }),
    doc({ id: "t2", title: "États-Unis" }),
    doc({ id: "t3", title: "algorithmique" }),
    doc({ id: "t4", title: "astronomie" }),
  ];

  it("ordre alphabétique insensible à la casse et aux accents", () => {
    expect(sortDocuments(titles, "title_asc").map((d) => d.title)).toEqual([
      "algorithmique",
      "astronomie",
      "États-Unis",
      "Zoologie",
    ]);
  });

  it("ordre alphabétique inverse", () => {
    expect(sortDocuments(titles, "title_desc").map((d) => d.title)).toEqual([
      "Zoologie",
      "États-Unis",
      "astronomie",
      "algorithmique",
    ]);
  });

  it("titres égaux → départage stable et identique à chaque exécution", () => {
    const tied = [
      doc({ id: "x", title: "Cours commun", createdAt: "2026-01-06T00:00:00.000Z" }),
      doc({ id: "y", title: "cours commun", createdAt: "2026-02-06T08:00:00.000Z" }),
      doc({ id: "z", title: "COURS COMMUN", createdAt: "2026-02-06T09:00:00.000Z" }),
    ];
    const asc = ids(sortDocuments(tied, "title_asc"));
    expect(asc).toEqual(ids(sortDocuments([...tied].reverse(), "title_asc")));
    expect(ids(sortDocuments(tied, "title_desc"))).toEqual(
      ids(sortDocuments([...tied].reverse(), "title_desc"))
    );
    // Départage : dépôt le plus récent d'abord (z avant y avant x).
    expect(asc).toEqual(["z", "y", "x"]);
  });
});

/* ───────────────────── Combinaison recherche + tri ───────────────────── */

describe("applyDocumentLibrary — recherche + tri combinés", () => {
  const items: DocumentListItem[] = [
    doc({ id: "c1", title: "Algorithmique avancée", createdAt: "2026-01-10T08:00:00.000Z" }),
    doc({ id: "c2", title: "Algorithmique bases", createdAt: "2026-04-01T08:00:00.000Z" }),
    doc({ id: "c3", title: "Optique", createdAt: "2026-03-05T08:00:00.000Z" }),
  ];

  it("recherche « algorithme » + « Plus récents »", () => {
    expect(ids(applyDocumentLibrary(items, "algorithme", "date_desc"))).toEqual(["c2", "c1"]);
  });

  it("même recherche + « Titre : A → Z »", () => {
    expect(ids(applyDocumentLibrary(items, "algorithme", "title_asc"))).toEqual(["c1", "c2"]);
  });

  it("le tri est conservé quelle que soit la recherche", () => {
    const sorted = ids(applyDocumentLibrary(items, "", "date_desc"));
    expect(sorted).toEqual(["c2", "c3", "c1"]);
    expect(ids(applyDocumentLibrary(items, "optique", "date_desc"))).toEqual(
      sorted.filter((id) => id === "c3")
    );
    expect(ids(applyDocumentLibrary(items, "", "date_desc"))).toEqual(sorted);
  });

  it("recherche sans résultat → liste vide (tri inchangé en interne)", () => {
    expect(applyDocumentLibrary(items, "chirurgie", "title_asc")).toEqual([]);
  });
});

/* ───────────────────────────── États UI ───────────────────────────── */

describe("resolveDocumentLibraryState", () => {
  it("bibliothèque vide → « empty » (jamais un échec de recherche)", () => {
    expect(resolveDocumentLibraryState(0, 0)).toBe("empty");
  });

  it("des documents existent mais aucun ne correspond → « no-results »", () => {
    expect(resolveDocumentLibraryState(3, 0)).toBe("no-results");
  });

  it("au moins un document correspond → « results »", () => {
    expect(resolveDocumentLibraryState(3, 2)).toBe("results");
    expect(resolveDocumentLibraryState(1, 1)).toBe("results");
  });
});

describe("formatDocumentCount", () => {
  it("sans recherche : total des documents", () => {
    expect(formatDocumentCount(3, 3, false)).toBe("3 document(s)");
  });

  it("avec recherche : résultats distincts du total", () => {
    expect(formatDocumentCount(1, 3, true)).toBe("1 sur 3 résultat(s)");
    expect(formatDocumentCount(0, 3, true)).toBe("0 sur 3 résultat(s)");
  });
});

/* ─────────────────────── Permissions pré-calculées ─────────────────────── */

describe("DocumentListItem.canDelete", () => {
  it("la permission est transportée telle quelle (le client n'infère rien)", () => {
    expect(doc({ id: "p1", canDelete: false }).canDelete).toBe(false);
    expect(doc({ id: "p2", canDelete: true }).canDelete).toBe(true);
  });
});
