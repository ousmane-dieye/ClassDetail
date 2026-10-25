import { describe, it, expect } from "vitest";
import { isAllowedAssistantHref, sanitizeAssistantActions, executeTool, parseWeekday, type ToolContext } from "@/lib/ai/tools";
import { isoDayOfWeek } from "@/lib/schedule/dates";

describe("isAllowedAssistantHref (liste blanche)", () => {
  it("accepte les liens internes autorisés", () => {
    for (const href of [
      "/dashboard",
      "/dashboard/tasks",
      "/dashboard/documents",
      "/dashboard/hints",
      "/dashboard/recordings",
      "/dashboard/schedule",
      "/dashboard/evaluations",
      "/dashboard/chat",
      "/dashboard/notifications",
      "/dashboard/stats",
      "/dashboard/admin",
    ]) {
      expect(isAllowedAssistantHref(href), href).toBe(true);
    }
  });

  it("couvre les modules emploi du temps et évaluations", () => {
    expect(isAllowedAssistantHref("/dashboard/schedule")).toBe(true);
    expect(isAllowedAssistantHref("/dashboard/evaluations")).toBe(true);
    // Les routes de détail restent INTERDITES (l'IA ne doit pas fabriquer d'URL
    // avec identifiants).
    expect(isAllowedAssistantHref("/dashboard/evaluations/123e4567-e89b-12d3-a456-426614174000")).toBe(false);
    expect(isAllowedAssistantHref("/dashboard/schedule?class=123e4567-e89b-12d3-a456-426614174000")).toBe(false);
  });

  it("rejette les URLs externes et les liens internes non autorisés", () => {
    expect(isAllowedAssistantHref("https://evil.example.com")).toBe(false);
    expect(isAllowedAssistantHref("javascript:alert(1)")).toBe(false);
    expect(isAllowedAssistantHref("/dashboard/hack")).toBe(false);
    expect(isAllowedAssistantHref("/dashboard/messages")).toBe(false);
    expect(isAllowedAssistantHref("/dashboard/messages?conv=123e4567-e89b-12d3-a456-426614174000")).toBe(false);
  });
});

describe("sanitizeAssistantActions", () => {
  it("ne conserve que les actions valides de la liste blanche", () => {
    const actions = sanitizeAssistantActions([
      { label: "Voir mes devoirs", href: "/dashboard/tasks" },
      { label: "Site externe", href: "https://evil.example.com" },
      { label: "Injection", href: "javascript:alert(1)" },
      { label: "Messages", href: "/dashboard/messages" },
    ]);
    expect(actions).toHaveLength(1);
    expect(actions[0]!.href).toBe("/dashboard/tasks");
  });

  it("ignore les entrées malformées", () => {
    expect(sanitizeAssistantActions("pas un tableau")).toEqual([]);
    expect(sanitizeAssistantActions([null, 42, { label: 1, href: "/dashboard" }])).toEqual([]);
  });

  it("limite à 3 actions et 40 caractères de libellé", () => {
    const raw = Array.from({ length: 6 }, (_, i) => ({
      label: `Action ${i}`,
      href: "/dashboard/tasks",
    }));
    const actions = sanitizeAssistantActions(raw);
    expect(actions).toHaveLength(3);

    const long = sanitizeAssistantActions([{ label: "a".repeat(80), href: "/dashboard/tasks" }]);
    expect(long).toEqual([]);
  });
});

// ---------------------------------------------------------------
// Exécution des outils emploi du temps / évaluations
// ---------------------------------------------------------------

type Row = Record<string, unknown>;

/** Client Supabase simulé : renvoie les lignes préchargées et enregistre les filtres appliqués. */
function fakeSupabase(tables: Record<string, Row[]>) {
  const ops: Array<{ table: string; method: string; args: unknown[] }> = [];
  const client = {
    from(table: string) {
      const chain: Record<string, unknown> = {};
      const record =
        (method: string) =>
        (...args: unknown[]) => {
          ops.push({ table, method, args });
          return chain;
        };
      for (const m of ["select", "eq", "neq", "gte", "lte", "order", "limit", "is"]) {
        chain[m] = record(m);
      }
      // Chaîne awaitable (Promise.all des outils).
      chain.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve({ data: tables[table] ?? [], error: null }).then(resolve, reject);
      return chain;
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

describe("executeTool getMySchedule", () => {
  const date = "2026-06-15";

  it("liste les cours publiés du jour (heure, matière, salle, prof)", async () => {
    const { client, ops } = fakeSupabase({
      schedule_sessions: [
        {
          id: "s1",
          class_id: "class1",
          subject_id: "sub1",
          day_of_week: isoDayOfWeek(date),
          start_time: "08:00:00",
          end_time: "10:00:00",
          room: "A1",
          teacher: "M. Ndiaye",
          valid_from: "2026-01-01",
          valid_until: null,
          status: "PUBLISHED",
        },
      ],
      subjects: [{ id: "sub1", name: "Mathématiques" }],
    });

    const res = await executeTool("getMySchedule", { date }, ctxFor(client));

    expect(res.ok).toBe(true);
    expect(res.content).toContain("Mathématiques");
    expect(res.content).toContain("08:00");
    expect(res.content).toContain("10:00");
    expect(res.content).toContain("A1");
    expect(res.content).toContain("M. Ndiaye");
    // La requête force le filtre côté base : jamais de brouillon, même pour un délégué.
    expect(
      ops.some((o) => o.table === "schedule_sessions" && o.method === "eq" && o.args[0] === "status" && o.args[1] === "PUBLISHED")
    ).toBe(true);
  });

  it("exclut les séances en brouillon même si la base les renvoie", async () => {
    const { client } = fakeSupabase({
      schedule_sessions: [
        {
          id: "s1",
          class_id: "class1",
          subject_id: "sub1",
          day_of_week: isoDayOfWeek(date),
          start_time: "08:00:00",
          end_time: "10:00:00",
          room: "A1",
          teacher: null,
          valid_from: "2026-01-01",
          valid_until: null,
          status: "DRAFT",
        },
      ],
      subjects: [{ id: "sub1", name: "Physique" }],
    });

    const res = await executeTool("getMySchedule", { date }, ctxFor(client));

    expect(res.ok).toBe(true);
    // Le brouillon ne doit jamais apparaître dans la réponse de l'assistant.
    expect(res.content).not.toContain("Physique");
  });

  it("signale un cours annulé par une exception datée", async () => {
    const { client } = fakeSupabase({
      schedule_sessions: [
        {
          id: "s1",
          class_id: "class1",
          subject_id: "sub1",
          day_of_week: isoDayOfWeek(date),
          start_time: "08:00:00",
          end_time: "10:00:00",
          room: "A1",
          teacher: null,
          valid_from: "2026-01-01",
          valid_until: null,
          status: "PUBLISHED",
        },
      ],
      schedule_session_exceptions: [
        {
          id: "e1",
          session_id: "s1",
          class_id: "class1",
          date,
          is_cancelled: true,
          new_start_time: null,
          new_end_time: null,
          new_room: null,
          new_subject_id: null,
          note: "Grève nationale",
        },
      ],
      subjects: [{ id: "sub1", name: "Mathématiques" }],
    });

    const res = await executeTool("getMySchedule", { date }, ctxFor(client));

    expect(res.ok).toBe(true);
    expect(res.content).toContain("ANNULÉ");
    expect(res.content).toContain("Grève nationale");
  });

  it("rejette un format de date invalide", async () => {
    const { client } = fakeSupabase({});
    const res = await executeTool("getMySchedule", { date: "15/06/2026" }, ctxFor(client));
    expect(res.ok).toBe(false);
  });

  it("signale quand la classe n'a aucune séance publiée", async () => {
    const { client } = fakeSupabase({ schedule_sessions: [] });
    const res = await executeTool("getMySchedule", { date }, ctxFor(client));
    expect(res.ok).toBe(true);
    expect(res.content).toContain("Aucune séance publiée");
  });
});

describe("parseWeekday (résolution serveur du jour)", () => {
  it("reconnaît les jours en français, anglais et en numéro ISO", () => {
    expect(parseWeekday("lundi")).toBe(1);
    expect(parseWeekday("Mardi")).toBe(2);
    expect(parseWeekday("mercredi ")).toBe(3);
    expect(parseWeekday("JEUDI")).toBe(4);
    expect(parseWeekday("dimanche")).toBe(7);
    expect(parseWeekday("monday")).toBe(1);
    expect(parseWeekday("Friday")).toBe(5);
    expect(parseWeekday("1")).toBe(1);
    expect(parseWeekday("7")).toBe(7);
  });

  it("tolère les accents et la casse", () => {
    expect(parseWeekday("Lundi".toLowerCase())).toBe(1);
    // « samedi » n'a pas d'accent, mais vérifions le normaliseur via « jeudi ».
    expect(parseWeekday("jeudi".normalize("NFD"))).toBe(4);
  });

  it("rejette les valeurs inconnues", () => {
    expect(parseWeekday("lunedi")).toBeNull(); // italien
    expect(parseWeekday("8")).toBeNull();
    expect(parseWeekday("jour")).toBeNull();
    expect(parseWeekday("")).toBeNull();
  });
});

describe("executeTool getMySchedule avec paramètre weekday", () => {
  it("résout « lundi » côté serveur vers le prochain lundi (cours retrouvé)", async () => {
    // Le serveur calcule la date : une séance récurrente le lundi (jour ISO 1)
    // doit être trouvée quel que soit le jour réel d'exécution.
    const { client, ops } = fakeSupabase({
      schedule_sessions: [
        {
          id: "s1",
          class_id: "class1",
          subject_id: "sub1",
          day_of_week: 1, // lundi
          start_time: "08:00:00",
          end_time: "10:00:00",
          room: "A1",
          teacher: null,
          valid_from: "2026-01-01",
          valid_until: null,
          status: "PUBLISHED",
        },
      ],
      subjects: [{ id: "sub1", name: "Mathématiques" }],
    });

    const res = await executeTool("getMySchedule", { weekday: "lundi" }, ctxFor(client));

    expect(res.ok).toBe(true);
    expect(res.content).toContain("Mathématiques");
    // La date envoyée en base est bien un lundi (le serveur a calculé, pas le modèle).
    const dateFilter = ops.find((o) => o.table === "schedule_session_exceptions" && o.method === "eq" && o.args[0] === "date");
    expect(dateFilter).toBeDefined();
    expect(isoDayOfWeek(dateFilter!.args[1] as string)).toBe(1);
  });

  it("rejette un jour non reconnu", async () => {
    const { client } = fakeSupabase({});
    const res = await executeTool("getMySchedule", { weekday: "lunedi" }, ctxFor(client));
    expect(res.ok).toBe(false);
    expect(res.content).toContain("non reconnu");
  });

  it("privilégie weekday sur date quand les deux sont fournis", async () => {
    const { client, ops } = fakeSupabase({ schedule_sessions: [] });
    // weekday « mardi » (2) : la date serveur doit être un mardi, ignorer la date 2026-06-15 (un lundi).
    await executeTool("getMySchedule", { weekday: "mardi", date: "2026-06-15" }, ctxFor(client));
    const dateFilter = ops.find((o) => o.table === "schedule_session_exceptions" && o.method === "eq" && o.args[0] === "date");
    expect(isoDayOfWeek(dateFilter!.args[1] as string)).toBe(2);
  });
});

describe("executeTool getMyEvaluations", () => {
  it("liste les évaluations publiées avec type, heure, salle et signal report", async () => {
    const { client, ops } = fakeSupabase({
      evaluations: [
        {
          id: "ev1",
          subject_id: "sub1",
          title: "Examen final",
          type: "EXAMEN",
          date: "2026-06-20",
          start_time: "08:00:00",
          end_time: "10:00:00",
          room: "Amphi",
          status: "PUBLISHED",
          rescheduled_from: "2026-06-18",
        },
      ],
      subjects: [{ id: "sub1", name: "Mathématiques" }],
    });

    const res = await executeTool("getMyEvaluations", {}, ctxFor(client));

    expect(res.ok).toBe(true);
    expect(res.content).toContain("Examen");
    expect(res.content).toContain("Examen final");
    expect(res.content).toContain("Mathématiques");
    expect(res.content).toContain("08:00");
    expect(res.content).toContain("Amphi");
    expect(res.content).toContain("reportée");
    // Filtre anti-brouillon côté base, indispensable pour un délégué.
    expect(
      ops.some((o) => o.table === "evaluations" && o.method === "neq" && o.args[0] === "status" && o.args[1] === "DRAFT")
    ).toBe(true);
  });

  it("conserve les évaluations annulées (la classe doit le savoir)", async () => {
    const { client } = fakeSupabase({
      evaluations: [
        {
          id: "ev1",
          subject_id: "sub1",
          title: "Contrôle de chimie",
          type: "CC",
          date: "2026-06-22",
          start_time: null,
          end_time: null,
          room: null,
          status: "CANCELLED",
          rescheduled_from: null,
        },
      ],
      subjects: [{ id: "sub1", name: "Chimie" }],
    });

    const res = await executeTool("getMyEvaluations", {}, ctxFor(client));

    expect(res.ok).toBe(true);
    expect(res.content).toContain("ANNULÉE");
    expect(res.content).toContain("Contrôle de chimie");
    // Pas d'heure renseignée : le texte doit le dire plutôt que d'inventer.
    expect(res.content).toContain("heure à confirmer");
  });

  it("signale quand aucune évaluation n'est à venir", async () => {
    const { client } = fakeSupabase({ evaluations: [] });
    const res = await executeTool("getMyEvaluations", {}, ctxFor(client));
    expect(res.ok).toBe(true);
    expect(res.content).toContain("Aucune évaluation publiée");
  });
});
