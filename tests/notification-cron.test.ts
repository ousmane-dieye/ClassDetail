import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeState, createFakeSupabaseClient } from "./helpers/fakeSupabase";

/* -------------------------------------------------------------------------
   Cron des rappels de devoirs (/api/cron/reminders) — matrice des préférences
   par étudiant. Aucun email réel : le service d'email est simulé.
   ------------------------------------------------------------------------- */

const h = vi.hoisted(() => ({
  state: { tables: {} as Record<string, any[]> },
  emails: [] as Array<{ userId: string; taskId?: string; daysLeft?: string }>,
  emailResult: { ok: true, skipped: false } as Record<string, any>,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => createFakeSupabaseClient(h.state)),
}));

vi.mock("@/lib/email/notifications", () => ({
  sendAssignmentReminderEmailToUser: vi.fn(async (input: any) => {
    h.emails.push(input);
    return { ...h.emailResult };
  }),
}));

import { GET } from "@/app/api/cron/reminders/route";

const CRON_SECRET = "secret-de-test";

function daysFromNow(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function seed(prefs: Array<Record<string, any>>) {
  h.state = createFakeState(
    {
      tasks: [
        {
          id: "task-1",
          title: "TP React",
          due_date: daysFromNow(3),
          class_id: "class-1",
          subject_id: "subj-1",
          is_expired: false,
          subjects: { name: "Développement Web" },
        },
      ],
      profiles: [
        { id: "s1", class_id: "class-1", email: "s1@test.dev", first_name: "S1" },
        { id: "s2", class_id: "class-1", email: "s2@test.dev", first_name: "S2" },
        { id: "s3", class_id: "class-1", email: "s3@test.dev", first_name: "S3" },
        { id: "s4", class_id: "class-1", email: "s4@test.dev", first_name: "S4" },
      ],
      task_completions: [],
      task_reminders_sent: [],
      notifications: [],
      notification_preferences: prefs,
    },
    // Contrainte réelle : unique (task_id, student_id, kind) — anti-doublon.
    { uniqueKeys: { task_reminders_sent: ["task_id", "student_id", "kind"] } }
  );
  h.emails = [];
  h.emailResult = { ok: true, skipped: false };
}

function callCron(secret: string = CRON_SECRET) {
  return GET(
    new Request("http://localhost/api/cron/reminders", {
      headers: { authorization: `Bearer ${secret}` },
    })
  );
}

function notificationsOf(recipientId: string) {
  return (h.state.tables["notifications"] ?? []).filter(
    (n: any) => n.recipient_id === recipientId
  );
}

beforeEach(() => {
  process.env.CRON_SECRET = CRON_SECRET;
  process.env.TZ = "UTC";
  seed([]);
});

describe("Sécurité du cron", () => {
  it("refuse un appel sans ou avec un mauvais jeton", async () => {
    seed([]);
    expect((await callCron("mauvais")).status).toBe(401);
    expect((await GET(new Request("http://localhost/x"))).status).toBe(401);
    expect(h.emails).toHaveLength(0);
  });

  it("accepte le jeton configuré", async () => {
    seed([]);
    const response = await callCron();
    expect(response.status).toBe(200);
  });
});

describe("Rappel J-3 — préférences individuelles", () => {
  it("couvre les 4 combinaisons de canaux dans une même classe", async () => {
    seed([
      { user_id: "s1", category: "ASSIGNMENT_REMINDERS", in_app_enabled: true, email_enabled: true },
      { user_id: "s2", category: "ASSIGNMENT_REMINDERS", in_app_enabled: true, email_enabled: false },
      { user_id: "s3", category: "ASSIGNMENT_REMINDERS", in_app_enabled: false, email_enabled: true },
      { user_id: "s4", category: "ASSIGNMENT_REMINDERS", in_app_enabled: false, email_enabled: false },
    ]);

    const body = await (await callCron()).json();

    // Interne : s1 + s2
    expect(notificationsOf("s1")).toHaveLength(1);
    expect(notificationsOf("s2")).toHaveLength(1);
    expect(notificationsOf("s3")).toHaveLength(0);
    expect(notificationsOf("s4")).toHaveLength(0);
    // E-mail : s1 + s3
    expect(h.emails.map((e) => e.userId).sort()).toEqual(["s1", "s3"]);
    // Statut du cron
    expect(body.notificationsCreated).toBe(2);
    expect(body.emailsSent).toBe(2);
    expect(body.emailsDisabled).toBe(2);
    expect(body.emailsFailed).toBe(0);
  });

  it("applique les valeurs par défaut aux étudiants sans préférence", async () => {
    seed([]);

    const body = await (await callCron()).json();

    // Défaut : interne + e-mail actifs pour les rappels
    expect(body.notificationsCreated).toBe(4);
    expect(body.emailsSent).toBe(4);
  });

  it("compte séparément les canaux désactivés (pas comme une erreur)", async () => {
    seed([
      { user_id: "s1", category: "ASSIGNMENT_REMINDERS", in_app_enabled: false, email_enabled: false },
      { user_id: "s2", category: "ASSIGNMENT_REMINDERS", in_app_enabled: false, email_enabled: false },
      { user_id: "s3", category: "ASSIGNMENT_REMINDERS", in_app_enabled: false, email_enabled: false },
      { user_id: "s4", category: "ASSIGNMENT_REMINDERS", in_app_enabled: false, email_enabled: false },
    ]);

    const body = await (await callCron()).json();

    expect(body.notificationsCreated).toBe(0);
    expect(body.notificationsDisabled).toBe(4);
    expect(body.emailsDisabled).toBe(4);
    expect(body.emailsFailed).toBe(0);
    expect(body.errors).toEqual([]);
    expect(h.emails).toHaveLength(0);
    expect(notificationsOf("s1")).toHaveLength(0);
  });
});

describe("Règles métier préservées malgré les préférences", () => {
  it("n'envoie rien à l'étudiant qui a déjà rendu son devoir", async () => {
    seed([
      { user_id: "s1", category: "ASSIGNMENT_REMINDERS", in_app_enabled: true, email_enabled: true },
    ]);
    h.state.tables["task_completions"] = [{ task_id: "task-1", student_id: "s1" }];

    const body = await (await callCron()).json();

    expect(notificationsOf("s1")).toHaveLength(0);
    expect(h.emails.some((e) => e.userId === "s1")).toBe(false);
    expect(body.tasksProcessed).toBe(1);
  });

  it("ne rappelle pas un devoir expiré", async () => {
    seed([
      { user_id: "s1", category: "ASSIGNMENT_REMINDERS", in_app_enabled: true, email_enabled: true },
    ]);
    h.state.tables["tasks"]![0]!.due_date = daysFromNow(-1);

    const body = await (await callCron()).json();

    expect(body.tasksProcessed).toBe(0);
    expect(h.emails).toHaveLength(0);
    expect(h.state.tables["notifications"]).toHaveLength(0);
  });

  it("envoie un rappel la veille (J-1) avec le libellé adapté", async () => {
    seed([
      { user_id: "s1", category: "ASSIGNMENT_REMINDERS", in_app_enabled: true, email_enabled: true },
      { user_id: "s2", category: "ASSIGNMENT_REMINDERS", in_app_enabled: true, email_enabled: false },
      { user_id: "s3", category: "ASSIGNMENT_REMINDERS", in_app_enabled: true, email_enabled: false },
      { user_id: "s4", category: "ASSIGNMENT_REMINDERS", in_app_enabled: true, email_enabled: false },
    ]);
    h.state.tables["tasks"]![0]!.due_date = daysFromNow(1);

    await callCron();

    // Le rappel de la veille utilise le même service, avec `daysLeft = "1"`.
    expect(h.emails[0]!.daysLeft).toBe("1");
    expect(h.emails[0]!.userId).toBe("s1");
    expect(notificationsOf("s1")[0]!.title).toBe("Échéance demain");
  });

  it("ne renvoie pas de rappel interne déjà émis (anti-doublon task_reminders_sent)", async () => {
    seed([
      { user_id: "s1", category: "ASSIGNMENT_REMINDERS", in_app_enabled: true, email_enabled: false },
      { user_id: "s2", category: "ASSIGNMENT_REMINDERS", in_app_enabled: true, email_enabled: false },
      { user_id: "s3", category: "ASSIGNMENT_REMINDERS", in_app_enabled: true, email_enabled: false },
      { user_id: "s4", category: "ASSIGNMENT_REMINDERS", in_app_enabled: true, email_enabled: false },
    ]);
    h.state.tables["task_reminders_sent"] = [{ task_id: "task-1", student_id: "s1", kind: "J3" }];

    const body = await (await callCron()).json();

    // Seul s2/s3/s4 peuvent recevoir la notification (s1 déjà tracé)
    expect(notificationsOf("s1")).toHaveLength(0);
    expect(body.notificationsCreated).toBe(3);
  });

  it("les préférences d'un étudiant n'affectent pas les autres", async () => {
    seed([
      { user_id: "s1", category: "ASSIGNMENT_REMINDERS", in_app_enabled: false, email_enabled: false },
    ]);

    const body = await (await callCron()).json();

    expect(notificationsOf("s1")).toHaveLength(0);
    expect(body.notificationsCreated).toBe(3); // s2, s3, s4 aux valeurs par défaut
  });

  it("respecte la date limite modifiée (J recalculé à chaque exécution)", async () => {
    seed([]);
    // Échéance repoussée de 5 jours : pas de rappel aujourd'hui
    h.state.tables["tasks"]![0]!.due_date = daysFromNow(5);

    const body = await (await callCron()).json();

    expect(body.tasksProcessed).toBe(0);
    expect(h.emails).toHaveLength(0);
  });
});
