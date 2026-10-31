import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { generateAssistantReply, type OpenAIChatMessage, type AssistantReply } from "@/lib/ai/openai";
import type { ToolContext } from "@/lib/ai/tools";

// ---------------------------------------------------------------
// Boucle d'outils + vérification des liens de la réponse finale.
// fetch est remplacé : aucune requête réseau, aucune clé utilisée.
// ---------------------------------------------------------------

const REAL_URL = "https://drive.google.com/file/d/REAL123/view";
const FAKE_URL = "https://drive.google.com/file/d/FABRICATED999/view";

type Row = Record<string, any>;

function createClient(tables: Record<string, Row[]>) {
  const client = {
    from(table: string) {
      const filters: Array<(row: Row) => boolean> = [];
      const q: any = {
        select: () => q,
        eq: (column: string, value: unknown) => {
          filters.push((row) => row[column] === value);
          return q;
        },
        order: () => q,
        limit: () => q,
        then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
          Promise.resolve({
            data: (tables[table] ?? []).filter((row) => filters.every((f) => f(row))),
            error: null,
          }).then(resolve, reject),
      };
      return q;
    },
  };
  return client;
}

function ctxFor(client: unknown): ToolContext {
  return {
    user: { id: "u1", first_name: "Awa", role: "STUDENT", class_id: "class1" },
    supabase: client as ToolContext["supabase"],
  };
}

const TABLES = {
  subjects: [{ id: "sub-c", class_id: "class1", name: "Programmation C" }],
  documents: [
    {
      id: "d1",
      class_id: "class1",
      subject_id: "sub-c",
      title: "Introduction aux pointeurs en langage C",
      description: "Support du cours",
      drive_url: REAL_URL,
      author_id: "a1",
      created_at: "2026-01-05T10:00:00.000Z",
    },
  ],
  hints: [],
  recordings: [],
};

/** Enchaîne des réponses OpenAI simulées (une par itération de la boucle). */
function stubOpenAi(messages: Array<Record<string, unknown>>) {
  let call = 0;
  const fetchMock = vi.fn(async () => {
    const payload = messages[Math.min(call, messages.length - 1)]!;
    call += 1;
    return new Response(JSON.stringify({ choices: [{ message: payload }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const SYSTEM: OpenAIChatMessage = { role: "system", content: "SYSTEM" };

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.OPENAI_API_KEY;
});

// La clé n'existe pas dans l'environnement de test : on en simule une pour
// entrer dans la boucle (aucun appel réseau réel n'est effectué, fetch est stubbé).
beforeEach(() => {
  process.env.OPENAI_API_KEY = "sk-test-dummy";
});

describe("generateAssistantReply — boucle d'outils de recherche", () => {
  it("exécute searchDocuments puis recopie les URL réelles de la réponse", async () => {
    stubOpenAi([
      {
        content: "",
        tool_calls: [
          { id: "c1", function: { name: "searchDocuments", arguments: JSON.stringify({ query: "pointeurs" }) } },
        ],
      },
      {
        content:
          `J'ai trouvé :\n\n1. [**Introduction aux pointeurs en langage C**](${REAL_URL}) — type : Document — matière : Programmation C — [Voir dans Documents](/dashboard/documents)`,
      },
    ]);

    const reply = await generateAssistantReply([SYSTEM], ctxFor(createClient(TABLES)));

    expect(reply.degraded).toBe(false);
    expect(reply.content).toContain(`[**Introduction aux pointeurs en langage C**](${REAL_URL})`);
    expect(reply.content).toContain("[Voir dans Documents](/dashboard/documents)");
  });

  it("retire un lien de fichier fabriqué par le modèle (libellé conservé)", async () => {
    stubOpenAi([
      { content: `Voici le document : [**TD sur les pointeurs**](${FAKE_URL})` },
    ]);

    const reply = await generateAssistantReply([SYSTEM], ctxFor(createClient(TABLES)));

    expect(reply.content).not.toContain(FAKE_URL);
    expect(reply.content).toContain("Voici le document : **TD sur les pointeurs**");
    expect(reply.content).not.toContain("[**TD sur les pointeurs**]");
  });

  it("retire un lien interne hors liste blanche", async () => {
    stubOpenAi([
      { content: `Détail : [ouvrir](/dashboard/documents/123e4567-e89b-12d3-a456-426614174000) et [liste](/dashboard/documents)` },
    ]);

    const reply = await generateAssistantReply([SYSTEM], ctxFor(createClient(TABLES)));

    expect(reply.content).not.toContain("/dashboard/documents/123e4567");
    expect(reply.content).toContain("ouvrir");
    expect(reply.content).toContain("[liste](/dashboard/documents)");
  });

  it("autorise les URL déjà échangées dans l'historique de la conversation", async () => {
    const history: OpenAIChatMessage[] = [
      SYSTEM,
      { role: "assistant", content: `Voici : [**Mon cours**](${REAL_URL})` },
      { role: "user", content: "et maintenant ?" },
    ];
    stubOpenAi([{ content: `Toujours ici : [**Mon cours**](${REAL_URL})` }]);

    const reply = await generateAssistantReply(history, ctxFor(createClient(TABLES)));

    expect(reply.content).toContain(`[**Mon cours**](${REAL_URL})`);
  });

  it("les réponses habituelles (sans ressources) passent intactes", async () => {
    stubOpenAi([
      {
        content:
          "Vous avez **3 devoirs** cette semaine :\n\n- Maths — jeudi\n- C — vendredi\n\nVoir [le détail](/dashboard/tasks).",
      },
    ]);

    const reply: AssistantReply = await generateAssistantReply(
      [SYSTEM],
      ctxFor(createClient(TABLES))
    );

    expect(reply.degraded).toBe(false);
    expect(reply.content).toBe(
      "Vous avez **3 devoirs** cette semaine :\n\n- Maths — jeudi\n- C — vendredi\n\nVoir [le détail](/dashboard/tasks)."
    );
  });

  it("retourne un repli dégradé si OpenAI répond en erreur (jamais de crash)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("boom", { status: 500 }))
    );

    const reply = await generateAssistantReply([SYSTEM], ctxFor(createClient(TABLES)));

    expect(reply.degraded).toBe(true);
    expect(reply.content).toContain("erreur temporaire");
  });
});
