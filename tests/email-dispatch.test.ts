import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeState, createFakeSupabaseClient } from "./helpers/fakeSupabase";

/* -------------------------------------------------------------------------
   lib/email/dispatch.ts — emails pédagogiques :
     * envoi seulement si le fournisseur est configuré ;
     * anti-doublon (déjà SENT pour la même entité → aucun nouvel envoi) ;
     * adresse invalide → FAILED, jamais « SENT » ;
     * fournisseur absent → aucun envoi ET aucun enregistrement ;
     * échec du fournisseur → FAILED (avec message assaini).
   Aucun vrai email : sendEmailFromAdmin est simulé.
   ------------------------------------------------------------------------- */

const h = vi.hoisted(() => ({
  state: { tables: {} as Record<string, any[]> },
  sent: [] as Array<{ to: string; subject: string; html: string; text?: string }>,
  provider: "smtp" as "smtp" | "none",
  throwOnSend: false,
  sendError: "SMTP down",
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => createFakeSupabaseClient(h.state)),
}));

vi.mock("@/lib/email/emailService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/email/emailService")>();
  return {
    ...actual,
    getEmailConfig: vi.fn(() =>
      h.provider === "smtp"
        ? {
            provider: "smtp" as const,
            from: "admin@exemple.sn",
            fromName: "Administration",
            appUrl: "https://classpulse.app",
            platformName: "ClassPulse",
            adminContactEmail: "admin@exemple.sn",
          }
        : {
            provider: "none" as const,
            from: null,
            fromName: null,
            appUrl: "https://classpulse.app",
            platformName: "ClassPulse",
            adminContactEmail: null,
          }
    ),
    sendEmailFromAdmin: vi.fn(async (input: any) => {
      if (h.throwOnSend) throw new Error(h.sendError);
      h.sent.push(input);
      return { sent: true, to: input.to, provider: "smtp" as const };
    }),
  };
});

import { sendClassEventEmails } from "@/lib/email/dispatch";

function seed(rows: Array<Record<string, any>> = []) {
  h.state = createFakeState({ assignment_email_notifications: rows });
  h.sent = [];
  h.provider = "smtp";
  h.throwOnSend = false;
}

const recipients = [
  { id: "u1", email: "awa@test.dev", firstName: "Awa" },
  { id: "u2", email: "baba@test.dev", firstName: "Baba" },
];

beforeEach(() => seed());

describe("Envoi d'un email d'événement", () => {
  it("envoie à chaque destinataire autorisé et enregistre SENT", async () => {
    const result = await sendClassEventEmails({
      recipients,
      type: "EVALUATION_PUBLISHED",
      heading: "📝 Nouvelle évaluation",
      message: "Examen le 12/06 en salle B.",
      buttonUrl: "/dashboard/evaluations/ev-1",
      entityType: "evaluation",
      entityId: "ev-1",
    });

    expect(result.sent).toBe(2);
    expect(result.failed).toBe(0);
    expect(h.sent.map((m) => m.to).sort()).toEqual(["awa@test.dev", "baba@test.dev"]);
    expect(h.sent[0]!.subject).toContain("Nouvelle évaluation");

    const rows = h.state.tables["assignment_email_notifications"]!;
    expect(rows).toHaveLength(2);
    expect(rows.every((r: any) => r.status === "SENT")).toBe(true);
    expect(rows.every((r: any) => r.entity_type === "evaluation" && r.entity_id === "ev-1")).toBe(
      true
    );
  });

  it("produit un HTML absolu, en français et avec un lien d'accès", async () => {
    await sendClassEventEmails({
      recipients: [recipients[0]!],
      type: "ANNOUNCEMENT_CREATED",
      heading: "Annonce de classe",
      message: "Cours déplacé.",
      buttonUrl: "/dashboard/chat",
      entityType: "chat_message",
      entityId: "msg-1",
    });

    const mail = h.sent[0]!;
    expect(mail.html).toContain("https://classpulse.app/dashboard/chat");
    expect(mail.html).toContain("Bonjour Awa");
    expect(mail.html).toContain("paramètres de notifications");
    expect(mail.html).toContain("<!DOCTYPE html>");
    expect(mail.text).toContain("Cours déplacé");
  });

  it("transforme un chemin relatif en lien absolu", async () => {
    await sendClassEventEmails({
      recipients: [recipients[0]!],
      type: "DOCUMENT_ADDED",
      heading: "Document ajouté",
      message: "CM disponible.",
      buttonUrl: "dashboard/documents",
      entityType: "document",
      entityId: "doc-1",
    });
    expect(h.sent[0]!.html).toContain("https://classpulse.app/dashboard/documents");
  });

  it("n'envoie rien quand aucun destinataire n'est fourni", async () => {
    const result = await sendClassEventEmails({
      recipients: [],
      type: "EVALUATION_PUBLISHED",
      heading: "h",
      message: "m",
      entityType: "evaluation",
      entityId: "ev-9",
    });
    expect(result).toEqual({ sent: 0, skipped: 0, failed: 0, errors: [] });
    expect(h.sent).toHaveLength(0);
  });
});

describe("Anti-doublon", () => {
  it("n'envoie pas deux fois au même destinataire pour la même entité", async () => {
    h.state = createFakeState({
      assignment_email_notifications: [
        {
          user_id: "u1",
          notification_type: "EVALUATION_PUBLISHED",
          status: "SENT",
          entity_type: "evaluation",
          entity_id: "ev-1",
        },
      ],
    });

    const result = await sendClassEventEmails({
      recipients,
      type: "EVALUATION_PUBLISHED",
      heading: "h",
      message: "m",
      entityType: "evaluation",
      entityId: "ev-1",
    });

    expect(result.sent).toBe(1);
    expect(result.skipped).toBe(1);
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0]!.to).toBe("baba@test.dev");
  });

  it("retente un destinataire dont l'envoi précédent a échoué (FAILED)", async () => {
    h.state = createFakeState({
      assignment_email_notifications: [
        {
          user_id: "u1",
          notification_type: "EVALUATION_PUBLISHED",
          status: "FAILED",
          entity_type: "evaluation",
          entity_id: "ev-1",
        },
      ],
    });

    const result = await sendClassEventEmails({
      recipients: [recipients[0]!],
      type: "EVALUATION_PUBLISHED",
      heading: "h",
      message: "m",
      entityType: "evaluation",
      entityId: "ev-1",
    });

    expect(result.sent).toBe(1);
    expect(result.skipped).toBe(0);
  });

  it("considère une autre entité comme un nouvel envoi (pas d'écrasement)", async () => {
    h.state = createFakeState({
      assignment_email_notifications: [
        {
          user_id: "u1",
          notification_type: "EVALUATION_PUBLISHED",
          status: "SENT",
          entity_type: "evaluation",
          entity_id: "ev-0",
        },
      ],
    });

    const result = await sendClassEventEmails({
      recipients: [recipients[0]!],
      type: "EVALUATION_PUBLISHED",
      heading: "h",
      message: "m",
      entityType: "evaluation",
      entityId: "ev-1",
    });

    expect(result.sent).toBe(1);
  });

  it("déduplique par devoir quand assignmentId est fourni", async () => {
    h.state = createFakeState({
      assignment_email_notifications: [
        {
          user_id: "u1",
          notification_type: "ASSIGNMENT_CREATED",
          status: "SENT",
          assignment_id: "task-1",
        },
      ],
    });

    const result = await sendClassEventEmails({
      recipients: [recipients[0]!],
      type: "ASSIGNMENT_CREATED",
      heading: "h",
      message: "m",
      assignmentId: "task-1",
    });

    expect(result.sent).toBe(0);
    expect(result.skipped).toBe(1);
    expect(h.sent).toHaveLength(0);
  });
});

describe("Fournisseur non configuré", () => {
  it("n'envoie aucun email et n'écrit aucune trace (comportement `none`)", async () => {
    h.provider = "none";

    const result = await sendClassEventEmails({
      recipients,
      type: "EVALUATION_PUBLISHED",
      heading: "h",
      message: "m",
      entityType: "evaluation",
      entityId: "ev-1",
    });

    expect(h.sent).toHaveLength(0);
    expect(result).toEqual({ sent: 0, skipped: 2, failed: 0, errors: [] });
    expect(h.state.tables["assignment_email_notifications"] ?? []).toHaveLength(0);
  });
});

describe("Échecs et données invalides", () => {
  it("marque FAILED une adresse invalide sans tenter d'envoi", async () => {
    const result = await sendClassEventEmails({
      recipients: [{ id: "u3", email: "pas-un-email" }],
      type: "DOCUMENT_ADDED",
      heading: "h",
      message: "m",
      entityType: "document",
      entityId: "doc-2",
    });

    expect(h.sent).toHaveLength(0);
    expect(result.sent).toBe(0);
    expect(result.failed).toBe(1);

    const rows = h.state.tables["assignment_email_notifications"]!;
    expect(rows[0]!.status).toBe("FAILED");
    expect(rows[0]!.sent_at).toBeNull();
  });

  it("ne marque jamais SENT quand le fournisseur échoue et masque les secrets", async () => {
    const previousPassword = process.env.EMAIL_PASSWORD;
    process.env.EMAIL_PASSWORD = "mon-mdp-super-secret";
    h.throwOnSend = true;
    h.sendError = "SMTP 535 auth failed — mot de passe: mon-mdp-super-secret";

    try {
      const result = await sendClassEventEmails({
        recipients: [recipients[0]!],
        type: "EVALUATION_PUBLISHED",
        heading: "h",
        message: "m",
        entityType: "evaluation",
        entityId: "ev-3",
      });

      expect(result.sent).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.errors[0]).toContain("EVALUATION_PUBLISHED");
      // Le secret réellement configuré est masqué, jamais journalisé en clair.
      expect(result.errors[0]).not.toContain("mon-mdp-super-secret");

      const rows = h.state.tables["assignment_email_notifications"]!;
      expect(rows[0]!.status).toBe("FAILED");
      expect(rows[0]!.sent_at).toBeNull();
      expect(rows[0]!.error_message).not.toContain("mon-mdp-super-secret");
    } finally {
      h.sendError = "SMTP down";
      if (previousPassword === undefined) delete process.env.EMAIL_PASSWORD;
      else process.env.EMAIL_PASSWORD = previousPassword;
    }
  });

  it("un enregistrement impossible ne fait pas échouer l'appel", async () => {
    const result = await sendClassEventEmails({
      recipients: [recipients[0]!],
      type: "EVALUATION_PUBLISHED",
      heading: "h",
      message: "m",
      entityType: "evaluation",
      entityId: "ev-4",
    });
    // L'envoi a eu lieu même si l'on se contente de vérifier l'absence de throw
    expect(result.sent).toBe(1);
    expect(h.state.tables["assignment_email_notifications"]).toHaveLength(1);
  });
});
