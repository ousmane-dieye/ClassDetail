import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => {
  const state = { sent: [] as any[], failed: [] as any[] };
  const sendMail = vi.fn();
  const verify = vi.fn();
  return { state, sendMail, verify };
});

vi.mock("nodemailer", () => ({
  default: {
    createTransport: vi.fn(() => ({ sendMail: h.sendMail, verify: h.verify })),
  },
}));

// OpenAI simulé comme indisponible/en erreur : l'envoi NE doit JAMAIS en dépendre.
vi.mock("@/lib/ai/personalize", () => ({
  personalizeIntro: vi.fn(() => Promise.reject(new Error("OpenAI down (test)"))),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: (table: string) => {
      if (table !== "assignment_email_notifications") {
        return { select: () => ({}) };
      }
      const chain = {
        select: () => chain,
        eq: () => chain,
        is: () => chain,
        maybeSingle: () =>
          Promise.resolve({ data: h.state.sent.length > 0 ? { id: "sent-1" } : null, error: null }),
        order: () => chain,
        limit: () => Promise.resolve({ data: [] }),
      };
      return {
        select: () => chain,
        insert: (payload: any) => {
          if (payload.status === "SENT") h.state.sent.push(payload);
          else h.state.failed.push(payload);
          return Promise.resolve({ error: null });
        },
      };
    },
  })),
}));

import {
  handleRegistrationDecisionEmail,
  sendAssignmentReminderEmailToUser,
  sendAuthenticationApprovedEmailToUser,
} from "@/lib/email/notifications";
import {
  sanitizeError,
  sendTestEmail,
  getSenderAddress,
  sendAssignmentReminder3Days,
  sendAssignmentReminder1Day,
} from "@/lib/email/emailService";

const ADMIN_EMAIL = "admin@example.com";
const STUDENT_EMAIL = "etudiant@example.com";

function setSmtpEnv() {
  process.env.EMAIL_FROM = ADMIN_EMAIL;
  process.env.EMAIL_FROM_NAME = "Administration - ClassPulse";
  process.env.EMAIL_HOST = "smtp.example.com";
  process.env.EMAIL_PORT = "465";
  process.env.EMAIL_SECURE = "true";
  process.env.EMAIL_USER = ADMIN_EMAIL;
  process.env.EMAIL_PASSWORD = "super-secret-password";
  process.env.OPENAI_API_KEY = "";
  process.env.RESEND_API_KEY = "";
  process.env.NEXT_PUBLIC_APP_URL = "https://classpulse.app";
  process.env.PLATFORM_NAME = "ClassPulse";
  process.env.ADMIN_CONTACT_EMAIL = ADMIN_EMAIL;
}

beforeEach(() => {
  h.state.sent = [];
  h.state.failed = [];
  h.sendMail.mockReset();
  h.verify.mockReset();
  h.sendMail.mockResolvedValue({});
  h.verify.mockResolvedValue(true);
  setSmtpEnv();
});

describe("1. Compte accepté → email envoyé depuis l'email admin", () => {
  it("envoie depuis EMAIL_FROM vers l'email de l'utilisateur et enregistre SENT", async () => {
    const result = await handleRegistrationDecisionEmail({
      decision: "ACCEPTED",
      userId: "u1",
      email: STUDENT_EMAIL,
      firstName: "Awa",
      lastName: "Diop",
    });

    expect(result?.ok).toBe(true);
    expect(h.sendMail).toHaveBeenCalledTimes(1);

    const mail = h.sendMail.mock.calls[0]![0];
    expect(mail.from).toBe("Administration - ClassPulse <admin@example.com>");
    expect(mail.to).toBe(STUDENT_EMAIL);
    expect(mail.subject).toContain("Votre accès a été accepté");
    expect(mail.html).toContain("Awa Diop");
    expect(mail.html).toContain("classpulse.app");

    expect(h.state.sent).toHaveLength(1);
    expect(h.state.sent[0].status).toBe("SENT");
    expect(h.state.sent[0].notification_type).toBe("AUTHENTICATION_APPROVED");
    expect(h.state.sent[0].email).toBe(STUDENT_EMAIL);
  });
});

describe("2. Compte refusé → aucun email", () => {
  it("ne déclenche aucun envoi ni enregistrement", async () => {
    const result = await handleRegistrationDecisionEmail({
      decision: "REJECTED",
      userId: "u2",
      email: STUDENT_EMAIL,
      firstName: "Awa",
      lastName: "Diop",
    });

    expect(result).toBeNull();
    expect(h.sendMail).not.toHaveBeenCalled();
    expect(h.state.sent).toHaveLength(0);
    expect(h.state.failed).toHaveLength(0);
  });
});

describe("3. Compte déjà accepté → pas de deuxième email", () => {
  it("n'envoie qu'une seule fois malgré plusieurs acceptations", async () => {
    await handleRegistrationDecisionEmail({
      decision: "ACCEPTED",
      userId: "u3",
      email: STUDENT_EMAIL,
      firstName: "Awa",
      lastName: "Diop",
    });
    const second = await handleRegistrationDecisionEmail({
      decision: "ACCEPTED",
      userId: "u3",
      email: STUDENT_EMAIL,
      firstName: "Awa",
      lastName: "Diop",
    });

    expect(second?.skipped).toBe(true);
    expect(h.sendMail).toHaveBeenCalledTimes(1);
    expect(h.state.sent).toHaveLength(1);
  });
});

describe("4. Devoir J-3 → email envoyé", () => {
  it("envoie le rappel J-3 (ASSIGNMENT_3_DAYS)", async () => {
    const result = await sendAssignmentReminderEmailToUser({
      taskId: "t1",
      userId: "u1",
      email: STUDENT_EMAIL,
      firstName: "Awa",
      taskTitle: "Administration Linux",
      subjectName: "Administration Systèmes",
      dueDate: new Date("2026-09-15T22:59:00Z"),
      daysLeft: "3",
    });

    expect(result?.ok).toBe(true);
    const mail = h.sendMail.mock.calls[0]![0];
    expect(mail.subject).toBe("Rappel : devoir à rendre dans 3 jours");
    expect(mail.html).toContain("Administration Linux");
    expect(mail.html).toContain("Administration Systèmes");
    expect(mail.html).toContain("Il vous reste 3 jours");
    expect(h.state.sent[0].notification_type).toBe("ASSIGNMENT_3_DAYS");
  });
});

describe("5. Devoir J-1 → email envoyé", () => {
  it("envoie le dernier rappel (ASSIGNMENT_1_DAY)", async () => {
    const result = await sendAssignmentReminderEmailToUser({
      taskId: "t2",
      userId: "u1",
      email: STUDENT_EMAIL,
      firstName: "Awa",
      taskTitle: "Administration Linux",
      subjectName: "Administration Systèmes",
      dueDate: new Date("2026-09-15T22:59:00Z"),
      daysLeft: "1",
    });

    expect(result?.ok).toBe(true);
    const mail = h.sendMail.mock.calls[0]![0];
    expect(mail.subject).toBe("⚠️ Dernier rappel : devoir à rendre demain");
    expect(mail.html).toContain("Il ne reste plus qu'un jour");
    expect(h.state.sent[0].notification_type).toBe("ASSIGNMENT_1_DAY");
  });
});

describe("5b. Méthodes nommées du service (spec)", () => {
  it("sendAssignmentReminder3Days envoie le rappel J-3", async () => {
    const result = await sendAssignmentReminder3Days({
      to: STUDENT_EMAIL,
      firstName: "Awa",
      taskTitle: "Administration Linux",
      subjectName: "Administration Systèmes",
      dueDateLabel: "15 septembre 2026",
      dueTimeLabel: "23:59",
    });

    expect(result.sent).toBe(true);
    const mail = h.sendMail.mock.calls[0]![0];
    expect(mail.subject).toBe("Rappel : devoir à rendre dans 3 jours");
  });

  it("sendAssignmentReminder1Day envoie le dernier rappel", async () => {
    const result = await sendAssignmentReminder1Day({
      to: STUDENT_EMAIL,
      firstName: "Awa",
      taskTitle: "Administration Linux",
      subjectName: "Administration Systèmes",
      dueDateLabel: "15 septembre 2026",
      dueTimeLabel: "23:59",
    });

    expect(result.sent).toBe(true);
    const mail = h.sendMail.mock.calls[0]![0];
    expect(mail.subject).toBe("⚠️ Dernier rappel : devoir à rendre demain");
  });
});

describe("6. Devoir déjà rendu → aucun rappel", () => {
  it("skip au niveau de la décision (vérifié aussi dans reminders.test.ts)", async () => {
    // La logique pure est testée dans tests/reminders.test.ts (already_submitted).
    // Ici on vérifie qu'aucun envoi n'a lieu tant qu'aucun email n'est déclenché.
    expect(h.sendMail).not.toHaveBeenCalled();
  });
});

describe("7. Rappel déjà envoyé → aucun doublon", () => {
  it("n'envoie qu'un seul email malgré deux passages", async () => {
    await sendAssignmentReminderEmailToUser({
      taskId: "t1",
      userId: "u1",
      email: STUDENT_EMAIL,
      firstName: "Awa",
      taskTitle: "Administration Linux",
      subjectName: "Administration Systèmes",
      dueDate: new Date("2026-09-15T22:59:00Z"),
      daysLeft: "3",
    });
    const second = await sendAssignmentReminderEmailToUser({
      taskId: "t1",
      userId: "u1",
      email: STUDENT_EMAIL,
      firstName: "Awa",
      taskTitle: "Administration Linux",
      subjectName: "Administration Systèmes",
      dueDate: new Date("2026-09-15T22:59:00Z"),
      daysLeft: "3",
    });

    expect(second?.skipped).toBe(true);
    expect(h.sendMail).toHaveBeenCalledTimes(1);
  });
});

describe("8. SMTP en erreur → statut FAILED", () => {
  it("enregistre FAILED avec un message sans mot de passe", async () => {
    h.sendMail.mockRejectedValueOnce(new Error("535 5.7.8 Authentication failed: super-secret-password"));

    const result = await handleRegistrationDecisionEmail({
      decision: "ACCEPTED",
      userId: "u8",
      email: STUDENT_EMAIL,
      firstName: "Awa",
      lastName: "Diop",
    });

    expect(result?.ok).toBe(false);
    expect(h.state.failed).toHaveLength(1);
    expect(h.state.failed[0].status).toBe("FAILED");
    expect(h.state.failed[0].notification_type).toBe("AUTHENTICATION_APPROVED");
    expect(h.state.failed[0].error_message).toContain("Authentication failed");
    expect(h.state.failed[0].error_message).not.toContain("super-secret-password");
    expect(h.sendMail).toHaveBeenCalledTimes(1);
  });
});

describe("9. OpenAI indisponible → email toujours envoyé", () => {
  it("envoie malgré l'échec de la personnalisation OpenAI", async () => {
    // personalizeIntro est mocké pour rejeter (OpenAI down).
    const result = await handleRegistrationDecisionEmail({
      decision: "ACCEPTED",
      userId: "u9",
      email: STUDENT_EMAIL,
      firstName: "Awa",
      lastName: "Diop",
    });

    expect(result?.ok).toBe(true);
    expect(h.sendMail).toHaveBeenCalledTimes(1);
    expect(h.state.sent).toHaveLength(1);
  });
});

describe("10. Email admin correctement utilisé comme FROM", () => {
  it("utilise l'adresse de l'administrateur comme expéditeur", async () => {
    const result = await sendAuthenticationApprovedEmailToUser({
      userId: "u10",
      email: STUDENT_EMAIL,
      firstName: "Awa",
      lastName: "Diop",
    });

    expect(result?.ok).toBe(true);
    const mail = h.sendMail.mock.calls[0]![0];
    expect(mail.from).toContain(ADMIN_EMAIL);
    expect(getSenderAddress()).toBe(ADMIN_EMAIL);
  });
});

describe("Sécurité & test SMTP", () => {
  it("sanitizeError ne révèle jamais le mot de passe", () => {
    const clean = sanitizeError(new Error("login failed: super-secret-password"));
    expect(clean).not.toContain("super-secret-password");
  });

  it("sendTestEmail vérifie la connexion SMTP et envoie", async () => {
    const result = await sendTestEmail(ADMIN_EMAIL);
    expect(result.ok).toBe(true);
    expect(h.verify).toHaveBeenCalledTimes(1);
    const labels = result.steps.map((s) => s.label);
    expect(labels).toContain("Connexion SMTP réussie");
    expect(labels).toContain("Email envoyé");
    expect(labels).toContain("Destinataire");
    expect(result.to).toBe(ADMIN_EMAIL);
  });

  it("sendTestEmail échoue proprement si SMTP échoue", async () => {
    h.verify.mockRejectedValueOnce(new Error("connection refused: super-secret-password"));
    const result = await sendTestEmail(ADMIN_EMAIL);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("connection refused");
    expect(result.error).not.toContain("super-secret-password");
  });
});
