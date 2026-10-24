import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeState, createFakeSupabaseClient } from "./helpers/fakeSupabase";

/* -------------------------------------------------------------------------
   Préférences appliquées côté serveur aux notifications internes et au
   dispatch e-mail (lib/notifications/service.ts).
   Aucun email réel : le dispatch est simulé et enregistré.
   ------------------------------------------------------------------------- */

const h = vi.hoisted(() => ({
  state: { tables: {} as Record<string, any[]> },
  dispatchCalls: [] as Array<any>,
  dispatchResult: { sent: 0, skipped: 0, failed: 0, errors: [] as string[] },
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => createFakeSupabaseClient(h.state)),
}));

vi.mock("@/lib/email/dispatch", () => ({
  sendClassEventEmails: vi.fn(async (input: any) => {
    h.dispatchCalls.push(input);
    return { ...h.dispatchResult };
  }),
}));

import {
  createNotification,
  notifyClassMembers,
  notifyClassMembersDetailed,
} from "@/lib/notifications/service";
import { sendClassEventEmails } from "@/lib/email/dispatch";

const CLASS_ID = "class-1";

function seed(members: Array<Record<string, any>>, prefs: Array<Record<string, any>> = []) {
  h.state = {
    tables: {
      profiles: members.map((m) => ({ class_id: CLASS_ID, ...m })),
      notification_preferences: prefs,
      notifications: [],
      assignment_email_notifications: [],
    },
  };
  h.dispatchCalls = [];
  h.dispatchResult = { sent: 0, skipped: 0, failed: 0, errors: [] };
}

function insertedNotifications() {
  return h.state.tables["notifications"] ?? [];
}

beforeEach(() => {
  seed([]);
});

describe("createNotification — canal interne par destinataire", () => {
  it("crée la notification quand aucune préférence n'est enregistrée (défaut actif)", async () => {
    seed([]);
    const result = await createNotification({
      userId: "u1",
      type: "DOCUMENT_ADDED",
      title: "t",
      message: "m",
    });
    expect(result?.id).toBeTruthy();
    expect(insertedNotifications()).toHaveLength(1);
  });

  it("n'écrit JAMAIS de notification si le canal interne est désactivé", async () => {
    seed([], [
      { user_id: "u1", category: "RESOURCES", in_app_enabled: false, email_enabled: true },
    ]);
    const result = await createNotification({
      userId: "u1",
      type: "DOCUMENT_ADDED",
      title: "t",
      message: "m",
    });
    expect(result).toBeNull();
    expect(insertedNotifications()).toHaveLength(0);
  });

  it("respecte un choix explicite conservé (canaux enregistrés)", async () => {
    seed([], [
      { user_id: "u1", category: "RESOURCES", in_app_enabled: true, email_enabled: false },
    ]);
    const result = await createNotification({
      userId: "u1",
      type: "DOCUMENT_ADDED",
      title: "t",
      message: "m",
    });
    expect(result?.id).toBeTruthy();
    expect(insertedNotifications()).toHaveLength(1);
  });

  it("ne filtre JAMAIS les événements système (inscription, rôle)", async () => {
    seed([], [
      { user_id: "u1", category: "CHAT", in_app_enabled: false, email_enabled: false },
      { user_id: "u1", category: "RESOURCES", in_app_enabled: false, email_enabled: false },
    ]);
    const result = await createNotification({
      userId: "u1",
      type: "REGISTRATION_ACCEPTED",
      title: "Inscription acceptée",
      message: "Bienvenue",
    });
    expect(result?.id).toBeTruthy();
    expect(insertedNotifications()).toHaveLength(1);
  });

  it("retourne null sans écrire si le destinataire ou le titre manque", async () => {
    seed([]);
    expect(await createNotification({ userId: "", type: "DOCUMENT_ADDED", title: "t", message: "m" })).toBeNull();
    expect(await createNotification({ userId: "u1", type: "DOCUMENT_ADDED", title: "", message: "m" })).toBeNull();
    expect(insertedNotifications()).toHaveLength(0);
  });
});

describe("notifyClassMembers — matrice des 4 combinaisons de canaux", () => {
  const base = {
    classId: CLASS_ID,
    type: "EVALUATION_PUBLISHED" as const,
    title: "Évaluation publiée",
    message: "Examen le 12",
    entityType: "evaluation",
    entityId: "ev-1",
  };

  const members = [
    { id: "m1", email: "m1@test.dev", first_name: "Awa" },
    { id: "m2", email: "m2@test.dev", first_name: "Baba" },
    { id: "m3", email: "m3@test.dev", first_name: "Coumba" },
    { id: "m4", email: "m4@test.dev", first_name: "Daouda" },
  ];

  const prefs = [
    { user_id: "m1", category: "EVALUATIONS", in_app_enabled: true, email_enabled: true },
    { user_id: "m2", category: "EVALUATIONS", in_app_enabled: true, email_enabled: false },
    { user_id: "m3", category: "EVALUATIONS", in_app_enabled: false, email_enabled: true },
    { user_id: "m4", category: "EVALUATIONS", in_app_enabled: false, email_enabled: false },
  ];

  it("applique les canaux par destinataire (jamais globalement)", async () => {
    seed(members, prefs);

    const result = await notifyClassMembersDetailed(base);

    // Interne : m1 + m2 uniquement
    expect(result.created).toBe(2);
    expect(insertedNotifications().map((n: any) => n.recipient_id).sort()).toEqual([
      "m1",
      "m2",
    ]);
    // E-mail : m1 + m3 uniquement
    expect(result.emailsSent).toBe(0); // dispatch simulé → 0 envoyé
    expect(h.dispatchCalls).toHaveLength(1);
    expect(h.dispatchCalls[0]!.recipients.map((r: any) => r.id).sort()).toEqual(["m1", "m3"]);
  });

  it("ne lance aucun dispatch e-mail si aucun destinataire n'a activé ce canal", async () => {
    seed(members, [
      { user_id: "m1", category: "EVALUATIONS", in_app_enabled: true, email_enabled: false },
      { user_id: "m2", category: "EVALUATIONS", in_app_enabled: true, email_enabled: false },
      { user_id: "m3", category: "EVALUATIONS", in_app_enabled: true, email_enabled: false },
      { user_id: "m4", category: "EVALUATIONS", in_app_enabled: true, email_enabled: false },
    ]);

    const result = await notifyClassMembersDetailed(base);

    expect(result.created).toBe(4);
    expect(h.dispatchCalls).toHaveLength(0);
  });

  it("désactiver l'e-mail n'empêche PAS la notification interne autorisée", async () => {
    seed(members, [
      { user_id: "m1", category: "EVALUATIONS", in_app_enabled: true, email_enabled: false },
      { user_id: "m2", category: "EVALUATIONS", in_app_enabled: true, email_enabled: false },
      { user_id: "m3", category: "EVALUATIONS", in_app_enabled: true, email_enabled: false },
      { user_id: "m4", category: "EVALUATIONS", in_app_enabled: true, email_enabled: false },
    ]);

    const result = await notifyClassMembersDetailed(base);

    expect(result.created).toBe(4);
    expect(h.dispatchCalls).toHaveLength(0);
  });

  it("désactiver l'interne n'empêche PAS l'e-mail autorisé", async () => {
    seed(members, [
      { user_id: "m1", category: "EVALUATIONS", in_app_enabled: false, email_enabled: true },
      { user_id: "m2", category: "EVALUATIONS", in_app_enabled: false, email_enabled: false },
      { user_id: "m3", category: "EVALUATIONS", in_app_enabled: false, email_enabled: false },
      { user_id: "m4", category: "EVALUATIONS", in_app_enabled: false, email_enabled: false },
    ]);

    const result = await notifyClassMembersDetailed(base);

    expect(result.created).toBe(0);
    expect(insertedNotifications()).toHaveLength(0);
    expect(h.dispatchCalls).toHaveLength(1);
    expect(h.dispatchCalls[0]!.recipients.map((r: any) => r.id)).toEqual(["m1"]);
  });

  it("exclut toujours l'auteur de l'événement des deux canaux", async () => {
    seed(members, prefs);

    await notifyClassMembersDetailed({ ...base, excludeUserId: "m1" });

    expect(insertedNotifications().some((n: any) => n.recipient_id === "m1")).toBe(false);
    expect(h.dispatchCalls[0]!.recipients.some((r: any) => r.id === "m1")).toBe(false);
  });

  it("n'envoie aucun e-mail pour un type sans canal e-mail (rappel, tâche terminée)", async () => {
    seed(members, [
      { user_id: "m1", category: "ASSIGNMENTS", in_app_enabled: true, email_enabled: true },
      { user_id: "m2", category: "ASSIGNMENTS", in_app_enabled: true, email_enabled: true },
      { user_id: "m3", category: "ASSIGNMENTS", in_app_enabled: true, email_enabled: true },
      { user_id: "m4", category: "ASSIGNMENTS", in_app_enabled: true, email_enabled: true },
    ]);

    const result = await notifyClassMembersDetailed({
      classId: CLASS_ID,
      type: "TASK_COMPLETED",
      title: "Devoir terminé",
      message: "…",
      entityType: "task",
      entityId: "task-1",
    });

    expect(result.created).toBe(4);
    expect(h.dispatchCalls).toHaveLength(0);
  });

  it("retourne toujours un nombre (compatibilité `notified` des actions)", async () => {
    seed(members, prefs);
    expect(await notifyClassMembers(base)).toBe(2);
  });

  it("compte les emails ignorés sans les traiter comme des erreurs", async () => {
    seed(members, prefs);
    h.dispatchResult = { sent: 1, skipped: 2, failed: 0, errors: [] };

    const result = await notifyClassMembersDetailed(base);

    expect(result.emailsSent).toBe(1);
    expect(result.emailsSkipped).toBe(2);
    expect(result.emailsFailed).toBe(0);
  });

  it("un échec d'e-mail n'annule ni ne duplique la notification interne", async () => {
    seed(members, prefs);
    h.dispatchResult = { sent: 0, skipped: 0, failed: 2, errors: ["err1", "err2"] };

    const result = await notifyClassMembersDetailed(base);

    expect(result.created).toBe(2);
    expect(insertedNotifications()).toHaveLength(2);
    expect(result.emailsFailed).toBe(2);
  });

  it("ne crée rien si la classe n'a aucun membre", async () => {
    seed([]);
    const result = await notifyClassMembersDetailed(base);
    expect(result.created).toBe(0);
    expect(h.dispatchCalls).toHaveLength(0);
  });
});

describe("Envoyer directement un dispatch (sécurité de l'interface)", () => {
  it("est bien le module simulé (aucun SMTP réel pendant les tests)", async () => {
    seed([]);
    const result = await sendClassEventEmails({
      recipients: [{ id: "x", email: "x@test.dev" }],
      type: "EVALUATION_PUBLISHED",
      heading: "h",
      message: "m",
    });
    expect(h.dispatchCalls).toHaveLength(1);
    expect(result.sent).toBe(0);
  });
});
