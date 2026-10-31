import { describe, it, expect } from "vitest";
import {
  searchResources,
  rankResourceHits,
  formatResourceResults,
  MAX_SEARCH_RESULTS,
  type ResourceHit,
} from "@/lib/ai/resourceSearch";
import { executeTool, type ToolContext } from "@/lib/ai/tools";
import { buildSystemPrompt } from "@/lib/ai/openai";

// ---------------------------------------------------------------
// Fake Supabase : applique réellement les filtres .eq() et enregistre
// les opérations (pour vérifier le filtre class_id imposé côté base).
// ---------------------------------------------------------------

type Row = Record<string, any>;

function createClient(tables: Record<string, Row[]>) {
  const ops: Array<{ table: string; method: string; args: unknown[] }> = [];
  const client = {
    from(table: string) {
      const filters: Array<(row: Row) => boolean> = [];
      let max = Number.POSITIVE_INFINITY;
      const q: any = {
        select: (...args: unknown[]) => {
          ops.push({ table, method: "select", args });
          return q;
        },
        eq: (column: string, value: unknown) => {
          ops.push({ table, method: "eq", args: [column, value] });
          filters.push((row) => row[column] === value);
          return q;
        },
        order: (...args: unknown[]) => {
          ops.push({ table, method: "order", args });
          return q;
        },
        limit: (n: number) => {
          max = n;
          ops.push({ table, method: "limit", args: [n] });
          return q;
        },
        then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
          Promise.resolve({
            data: (tables[table] ?? []).filter((row) => filters.every((f) => f(row))).slice(0, max),
            error: null,
          }).then(resolve, reject),
      };
      return q;
    },
  };
  return { client, ops };
}

function ctxFor(client: unknown): ToolContext {
  return {
    user: { id: "u1", first_name: "Awa", role: "STUDENT", class_id: "class1" },
    supabase: client as ToolContext["supabase"],
  };
}

const SUBJECTS: Row[] = [
  { id: "sub-c", class_id: "class1", name: "Programmation C" },
  { id: "sub-m", class_id: "class1", name: "Mathématiques" },
  { id: "sub-a", class_id: "class1", name: "Algorithmique" },
];

const DOCUMENTS: Row[] = [
  {
    id: "d1",
    class_id: "class1",
    subject_id: "sub-c",
    title: "Introduction aux pointeurs en langage C",
    description: "Support du cours 3",
    drive_url: "https://drive.google.com/file/d/DOC1/view",
    author_id: "a1",
    created_at: "2026-01-05T10:00:00.000Z",
  },
  {
    id: "d2",
    class_id: "class1",
    subject_id: "sub-c",
    title: "TD sur les pointeurs",
    description: "Exercices 1 à 6",
    drive_url: "https://drive.google.com/file/d/DOC2/view",
    author_id: "a1",
    created_at: "2026-01-06T10:00:00.000Z",
  },
  {
    id: "d3",
    class_id: "class1",
    subject_id: "sub-m",
    title: "Chapitre 4 — Intégrales",
    description: "Cours complet",
    drive_url: "https://drive.google.com/file/d/DOC3/view",
    author_id: "a2",
    created_at: "2026-01-07T10:00:00.000Z",
  },
  // Autre classe : ne doit JAMAIS apparaître.
  {
    id: "d4",
    class_id: "other-class",
    subject_id: "sub-x",
    title: "TD sur les pointeurs (autre classe)",
    description: "Exclusif",
    drive_url: "https://drive.google.com/file/d/SECRET/view",
    author_id: "a3",
    created_at: "2026-01-08T10:00:00.000Z",
  },
];

const HINTS: Row[] = [
  {
    id: "h1",
    class_id: "class1",
    subject_id: "sub-a",
    title: "Examen final — Algorithmique",
    type: "EXAMEN",
    year: "2023",
    drive_url: "https://drive.google.com/file/d/HINT1/view",
    author_id: "a1",
    created_at: "2026-01-04T10:00:00.000Z",
  },
  {
    id: "h2",
    class_id: "class1",
    subject_id: "sub-c",
    title: "Corrigé TD pointeurs",
    type: "DEVOIR",
    year: "2024",
    drive_url: "https://drive.google.com/file/d/HINT2/view",
    author_id: "a1",
    created_at: "2026-01-03T10:00:00.000Z",
  },
  // Autre classe : ne doit JAMAIS apparaître.
  {
    id: "h3",
    class_id: "other-class",
    subject_id: "sub-x",
    title: "Corrigé TD pointeurs (autre classe)",
    type: "DEVOIR",
    year: "2025",
    drive_url: "https://drive.google.com/file/d/SECRET_HINT/view",
    author_id: "a9",
    created_at: "2026-01-09T10:00:00.000Z",
  },
];

const RECORDINGS: Row[] = [
  {
    id: "r1",
    class_id: "class1",
    subject_id: "sub-c",
    title: "Cours 5 — Les pointeurs en C",
    description: "Récapitulatif de la séance",
    date: "2026-02-10",
    drive_url: "https://drive.google.com/file/d/REC1/view",
    creator_id: "delegate-1",
    created_at: "2026-02-10T18:00:00.000Z",
  },
  {
    id: "r2",
    class_id: "other-class",
    subject_id: "sub-x",
    title: "Cours pointeurs (autre classe)",
    description: "Privé",
    date: "2026-02-11",
    drive_url: "https://drive.google.com/file/d/SECRET2/view",
    creator_id: "delegate-2",
    created_at: "2026-02-11T18:00:00.000Z",
  },
];

function seed() {
  return {
    subjects: SUBJECTS,
    documents: DOCUMENTS,
    hints: HINTS,
    recordings: RECORDINGS,
  };
}

// ---------------------------------------------------------------
// Recherche documents
// ---------------------------------------------------------------

describe("searchResources — documents", () => {
  it("retrouve un document par son titre (URL réelle + page interne)", async () => {
    const { client } = createClient(seed());
    const outcome = await searchResources({ client: client as any, classId: "class1", category: "documents", query: "pointeurs" });

    expect(outcome.ok).toBe(true);
    const ids = outcome.results.map((r) => r.id);
    expect(ids).toContain("d1");
    expect(ids).toContain("d2");

    const hit = outcome.results.find((r) => r.id === "d1")!;
    expect(hit.title).toBe("Introduction aux pointeurs en langage C");
    expect(hit.subject).toBe("Programmation C");
    expect(hit.url).toBe("https://drive.google.com/file/d/DOC1/view");
    expect(hit.moduleHref).toBe("/dashboard/documents");
  });

  it("retrouve un document par sa matière (même sans le mot dans le titre)", async () => {
    const { client } = createClient(seed());
    const outcome = await searchResources({ client: client as any, classId: "class1", category: "documents", query: "mathématiques" });

    expect(outcome.results.map((r) => r.id)).toEqual(["d3"]);
    expect(outcome.results[0]!.subject).toBe("Mathématiques");
  });

  it("recherche insensible à la casse et aux accents", async () => {
    const { client } = createClient(seed());
    const outcome = await searchResources({ client: client as any, classId: "class1", category: "documents", query: "MATHÉMATIQUES" });
    expect(outcome.results.map((r) => r.id)).toEqual(["d3"]);
  });

  it("retrouve un TD", async () => {
    const { client } = createClient(seed());
    const outcome = await searchResources({ client: client as any, classId: "class1", category: "documents", query: "TD pointeurs" });
    expect(outcome.results.map((r) => r.id)).toEqual(["d2"]);
  });

  it("n'expose jamais les documents d'une autre classe (filtre class_id + RLS)", async () => {
    const { client, ops } = createClient(seed());
    const outcome = await searchResources({ client: client as any, classId: "class1", category: "documents", query: "pointeurs" });

    expect(outcome.results.map((r) => r.id)).not.toContain("d4");
    expect(outcome.results.every((r) => !r.url.includes("SECRET"))).toBe(true);
    // Le filtre est imposé côté base, pas seulement en mémoire.
    expect(ops.some((o) => o.table === "documents" && o.method === "eq" && o.args[0] === "class_id" && o.args[1] === "class1")).toBe(true);
    expect(ops.some((o) => o.table === "subjects" && o.method === "eq" && o.args[0] === "class_id" && o.args[1] === "class1")).toBe(true);
  });
});

// ---------------------------------------------------------------
// Recherche Hints & Sujets
// ---------------------------------------------------------------

describe("searchResources — hints & sujets", () => {
  it("retrouve un sujet d'examen avec type, promotion et lien réel", async () => {
    const { client } = createClient(seed());
    const outcome = await searchResources({ client: client as any, classId: "class1", category: "hints", query: "examen algorithmique" });

    expect(outcome.results.map((r) => r.id)).toEqual(["h1"]);
    const hit = outcome.results[0]!;
    expect(hit.type).toBe("Examen");
    expect(hit.detail).toBe("Promotion 2023");
    expect(hit.subject).toBe("Algorithmique");
    expect(hit.url).toBe("https://drive.google.com/file/d/HINT1/view");
    expect(hit.moduleHref).toBe("/dashboard/hints");
  });

  it("retrouve un corrigé de TD", async () => {
    const { client } = createClient(seed());
    const outcome = await searchResources({ client: client as any, classId: "class1", category: "hints", query: "corrigé TD" });

    expect(outcome.results.map((r) => r.id)).toEqual(["h2"]);
    expect(outcome.results[0]!.type).toBe("Devoir");
  });
});

// ---------------------------------------------------------------
// Recherche cours enregistrés
// ---------------------------------------------------------------

describe("searchResources — cours enregistrés", () => {
  it("retrouve un cours enregistré de la classe uniquement", async () => {
    const { client, ops } = createClient(seed());
    const outcome = await searchResources({ client: client as any, classId: "class1", category: "recordings", query: "pointeurs" });

    expect(outcome.results.map((r) => r.id)).toEqual(["r1"]);
    expect(outcome.results[0]!.type).toBe("Cours enregistré");
    expect(outcome.results[0]!.detail).toBe("10 février 2026");
    expect(outcome.results[0]!.moduleHref).toBe("/dashboard/recordings");
    expect(outcome.results.map((r) => r.url)).not.toContain("https://drive.google.com/file/d/SECRET2/view");
    expect(ops.some((o) => o.table === "recordings" && o.method === "eq" && o.args[0] === "class_id" && o.args[1] === "class1")).toBe(true);
  });
});

// ---------------------------------------------------------------
// Aucun résultat / alternatives
// ---------------------------------------------------------------

describe("searchResources — absence de résultat", () => {
  it("retourne aucune ressource et aucun lien pour une recherche vide de sens", async () => {
    const { client } = createClient(seed());
    const outcome = await searchResources({ client: client as any, classId: "class1", category: "documents", query: "astronomie quantique" });

    expect(outcome.results).toEqual([]);
    expect(outcome.alternatives).toEqual([]);

    const formatted = formatResourceResults({
      category: "documents",
      query: "astronomie quantique",
      results: outcome.results,
      alternatives: outcome.alternatives,
    });
    expect(formatted).toContain("AUCUN résultat");
    expect(formatted).toContain("Je n'ai pas trouvé de ressource correspondant à ta recherche dans les documents auxquels tu as accès.");
    expect(formatted).not.toContain("drive.google.com");
  });

  it("propose des alternatives proches uniquement quand la recherche stricte échoue", async () => {
    const { client } = createClient(seed());
    const outcome = await searchResources({ client: client as any, classId: "class1", category: "documents", query: "pointeurs chimie" });

    expect(outcome.results).toEqual([]);
    expect(outcome.alternatives.length).toBeGreaterThan(0);
    expect(outcome.alternatives.map((r) => r.id)).toContain("d1");

    const formatted = formatResourceResults({
      category: "documents",
      query: "pointeurs chimie",
      results: outcome.results,
      alternatives: outcome.alternatives,
    });
    expect(formatted).toContain("Alternatives proches");
  });
});

// ---------------------------------------------------------------
// Classement (fonctions pures)
// ---------------------------------------------------------------

function hit(partial: Partial<ResourceHit> & { id: string; title: string }): ResourceHit {
  return {
    category: "documents",
    type: "Document",
    subject: null,
    description: null,
    detail: null,
    url: "https://drive.google.com/file/d/X/view",
    moduleHref: "/dashboard/documents",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

describe("rankResourceHits — pertinence et limites", () => {
  it("classe la correspondance exacte de titre en premier", () => {
    const hits = [
      hit({ id: "1", title: "Algorithmique — TD 2" }),
      hit({ id: "2", title: "Algorithmique" }),
      hit({ id: "3", title: "Physique quantique" }),
    ];
    const ranked = rankResourceHits(hits, "algorithmique");
    expect(ranked.map((h) => h.id)).toEqual(["2", "1"]);
  });

  it("ne présente que 5 ressources au maximum", () => {
    const hits = Array.from({ length: 9 }, (_, i) =>
      hit({ id: `h${i}`, title: `Exercices de révision ${i}`, createdAt: `2026-01-0${i + 1}T00:00:00.000Z` })
    );
    const ranked = rankResourceHits(hits, "exercices");
    expect(ranked).toHaveLength(MAX_SEARCH_RESULTS);
    // Les plus récents d'abord à score égal.
    expect(ranked[0]!.id).toBe("h8");
  });

  it("supprime les doublons (même titre + même matière)", () => {
    const hits = [
      hit({ id: "a", title: "TD pointeurs", subject: "Programmation C" }),
      hit({ id: "b", title: "TD pointeurs", subject: "Programmation C", url: "https://drive.google.com/file/d/OTHER/view" }),
    ];
    const ranked = rankResourceHits(hits, "pointeurs");
    expect(ranked).toHaveLength(1);
    expect(ranked[0]!.id).toBe("a");
  });

  it("exclut les ressources sans rapport avec la question", () => {
    const hits = [hit({ id: "a", title: "Chimie organique" }), hit({ id: "b", title: "Pointeurs en C" })];
    expect(rankResourceHits(hits, "pointeurs").map((h) => h.id)).toEqual(["b"]);
  });
});

// ---------------------------------------------------------------
// Intégration avec les outils de l'assistant
// ---------------------------------------------------------------

describe("executeTool — outils de recherche", () => {
  it("searchDocuments renvoie des liens markdown réels à recopier", async () => {
    const { client } = createClient(seed());
    const res = await executeTool("searchDocuments", { query: "pointeurs" }, ctxFor(client));

    expect(res.ok).toBe(true);
    expect(res.content).toContain("[**Introduction aux pointeurs en langage C**](https://drive.google.com/file/d/DOC1/view)");
    expect(res.content).toContain("[Voir dans Documents](/dashboard/documents)");
    expect(res.content).toContain("type : Document");
    expect(res.content).toContain("matière : Programmation C");
    expect(res.content).toContain("n'invente jamais de titre");
    expect(res.content).not.toContain("SECRET");
  });

  it("searchHints renvoie le sujet d'examen avec son type", async () => {
    const { client } = createClient(seed());
    const res = await executeTool("searchHints", { query: "examen algorithmique" }, ctxFor(client));

    expect(res.ok).toBe(true);
    expect(res.content).toContain("type : Examen");
    expect(res.content).toContain("matière : Algorithmique");
    expect(res.content).toContain("[**Examen final — Algorithmique**](https://drive.google.com/file/d/HINT1/view)");
    expect(res.content).toContain("[Voir dans Hints & Sujets](/dashboard/hints)");
  });

  it("searchRecordings renvoie le cours enregistré", async () => {
    const { client } = createClient(seed());
    const res = await executeTool("searchRecordings", { query: "pointeurs" }, ctxFor(client));

    expect(res.ok).toBe(true);
    expect(res.content).toContain("type : Cours enregistré");
    expect(res.content).toContain("[**Cours 5 — Les pointeurs en C**](https://drive.google.com/file/d/REC1/view)");
    expect(res.content).toContain("[Voir dans Cours enregistrés](/dashboard/recordings)");
    expect(res.content).not.toContain("SECRET2");
  });

  it("aucun résultat : message imposé, sans lien ni ressource inventée", async () => {
    const { client } = createClient(seed());
    const res = await executeTool("searchDocuments", { query: "astronomie" }, ctxFor(client));

    expect(res.ok).toBe(true);
    expect(res.content).toContain("AUCUN résultat");
    expect(res.content).toContain("Je n'ai pas trouvé de ressource correspondant à ta recherche dans les documents auxquels tu as accès.");
    expect(res.content).not.toContain("drive.google.com");
  });

  it("refuse une requête trop courte", async () => {
    const { client } = createClient(seed());
    const res = await executeTool("searchDocuments", { query: "a" }, ctxFor(client));
    expect(res.ok).toBe(false);
  });

  it("searchPlatform interroge les trois catégories réelles", async () => {
    const { client } = createClient(seed());
    const res = await executeTool("searchPlatform", { query: "pointeurs" }, ctxFor(client));

    expect(res.ok).toBe(true);
    expect(res.content).toContain("dans Documents");
    expect(res.content).toContain("dans Hints & Sujets");
    expect(res.content).toContain("dans Cours enregistrés");
  });

  it("les outils de liste (getMyDocuments, getMyHints, getMyCourses) affichent aussi les liens réels", async () => {
    const { client } = createClient(seed());

    const docs = await executeTool("getMyDocuments", {}, ctxFor(client));
    expect(docs.content).toContain("[Ouvrir le document](https://drive.google.com/file/d/DOC1/view)");

    const hints = await executeTool("getMyHints", {}, ctxFor(client));
    expect(hints.content).toContain("[Ouvrir le sujet](https://drive.google.com/file/d/HINT1/view)");

    const rec = await executeTool("getMyCourses", {}, ctxFor(client));
    expect(rec.content).toContain("[Ouvrir le cours](https://drive.google.com/file/d/REC1/view)");
  });
});

// ---------------------------------------------------------------
// Périmètre d'accès
// ---------------------------------------------------------------

describe("searchResources — périmètre de l'utilisateur connecté", () => {
  it("utilisateur sans classe : aucun résultat et aucune requête exécutée", async () => {
    const { client, ops } = createClient(seed());
    const outcome = await searchResources({
      client: client as any,
      classId: null,
      category: "documents",
      query: "pointeurs",
    });

    expect(outcome.ok).toBe(true);
    expect(outcome.results).toEqual([]);
    expect(outcome.alternatives).toEqual([]);
    expect(ops).toHaveLength(0);
  });

  it("les ressources des autres classes ne sont jamais lisibles, même par un mot-clé correspondant", async () => {
    const { client, ops } = createClient(seed());
    // Le modèle ne fournit AUCUN identifiant : seuls des termes de recherche
    // sont acceptés, et le filtre de classe s'applique quelle que soit la requête.
    const outcome = await searchResources({
      client: client as any,
      classId: "class1",
      category: "hints",
      query: "corrigé TD pointeurs",
    });

    expect(outcome.results.map((r) => r.id)).toEqual(["h2"]);
    expect(outcome.results.map((r) => r.url)).not.toContain("https://drive.google.com/file/d/SECRET_HINT/view");
    expect(ops.some((o) => o.table === "hints" && o.method === "eq" && o.args[0] === "class_id" && o.args[1] === "class1")).toBe(true);
  });
});

// ---------------------------------------------------------------
// Prompt système
// ---------------------------------------------------------------

describe("buildSystemPrompt — capacité de recherche", () => {
  it("instruit le modèle sur les trois outils et la présentation des liens", () => {
    const prompt = buildSystemPrompt({ firstName: "Awa", role: "STUDENT", className: "L2", now: new Date("2026-06-15T10:00:00Z") });

    expect(prompt).toContain("searchDocuments");
    expect(prompt).toContain("searchHints");
    expect(prompt).toContain("searchRecordings");
    expect(prompt).toContain("RECHERCHE DE RESSOURCES");
    expect(prompt).toContain("SANS LES MODIFIER");
    expect(prompt).toContain("Maximum 5 ressources");
    expect(prompt).toContain("N'invente jamais d'URL");
  });
});
