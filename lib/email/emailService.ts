/**
 * SERVICE EMAIL CENTRALISÉ — l'unique point d'envoi de la plateforme.
 *
 * Règles :
 *   - Une seule configuration d'envoi (provider) est active à la fois.
 *   - EXPÉDITEUR (FROM) : toujours l'adresse email de l'administrateur (EMAIL_FROM).
 *   - DESTINATAIRES (TO) : l'adresse de l'utilisateur concerné.
 *   - Les identifiants (EMAIL_PASSWORD, clés) ne vivent que côté serveur, dans l'environnement.
 *   - Aucune donnée secrète n'est jamais journalisée (voir sanitizeError).
 *
 * Provider actif :
 *   1. SMTP (nodemailer) si EMAIL_HOST + EMAIL_USER + EMAIL_PASSWORD sont renseignés ;
 *   2. sinon Resend (compatibilité avec l'ancien service) si RESEND_API_KEY est renseigné ;
 *   3. sinon mode "non configuré" : les envois sont ignorés proprement (app fonctionne sans email).
 */

import nodemailer from "nodemailer";
import { Resend } from "resend";
import { personalizeIntro } from "@/lib/ai/personalize";
import {
  emailLayout,
  renderAuthenticationApprovedTemplate,
  renderAssignmentReminderTemplate,
  renderTestEmailTemplate,
  type AssignmentReminderData,
} from "@/lib/email/templates";

export type EmailProvider = "smtp" | "resend" | "none";

export interface EmailConfig {
  provider: EmailProvider;
  from: string;
  fromName: string;
  appUrl: string;
  platformName: string;
  adminContactEmail: string;
}

export interface SendEmailResult {
  sent: boolean;
  skipped?: boolean;
  reason?: string;
  to: string;
  provider: EmailProvider;
  /** ISO date de l'envoi (utile pour le dashboard et le test SMTP). */
  date?: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Adresse brute (sans le nom d'affichage) depuis un champ "Name <email>". */
function extractAddress(raw: string): string {
  const match = raw.match(/<([^>]+)>/);
  return (match?.[1] ?? raw).trim();
}

export function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email);
}

/** Lit la configuration depuis les variables d'environnement (jamais depuis le code). */
export function getEmailConfig(): EmailConfig {
  const rawFrom = process.env.EMAIL_FROM || process.env.RESEND_FROM_EMAIL || "ClassPulse <noreply@classpulse.app>";
  const from = extractAddress(rawFrom);
  const fromName =
    process.env.EMAIL_FROM_NAME ||
    (rawFrom.includes("<") ? (rawFrom.split("<")[0] ?? "").trim() : "ClassPulse") ||
    "ClassPulse";

  const hasSmtp = Boolean(process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASSWORD);
  const provider: EmailProvider = hasSmtp ? "smtp" : process.env.RESEND_API_KEY ? "resend" : "none";

  return {
    provider,
    from,
    fromName,
    appUrl: process.env.APP_URL || "https://classdetail.vercel.app",
    platformName: process.env.PLATFORM_NAME || "ClassPulse",
    adminContactEmail: process.env.ADMIN_CONTACT_EMAIL || from,
  };
}

/** Adresse expéditeur affichée (sans secret). */
export function getSenderAddress(): string {
  return getEmailConfig().from;
}

function getFromHeader(config: EmailConfig): string {
  return `${config.fromName} <${config.from}>`;
}

let transporter: nodemailer.Transporter | null = null;
let transporterConfig = "";

function getTransporter(config: EmailConfig): nodemailer.Transporter | null {
  const smtpKey = `${config.provider}:${process.env.EMAIL_HOST}:${process.env.EMAIL_PORT}`;
  if (transporter && transporterConfig === smtpKey) return transporter;
  if (config.provider !== "smtp") return null;

  const secureRaw = process.env.EMAIL_SECURE;
  const secure =
    secureRaw === undefined || secureRaw === ""
      ? undefined
      : !["false", "0", "no", "off"].includes(String(secureRaw).toLowerCase());

  transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: Number(process.env.EMAIL_PORT || 465),
    secure,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD,
    },
  });
  transporterConfig = smtpKey;
  return transporter;
}

let resendClient: Resend | null = null;

function getResendClient(config: EmailConfig): Resend | null {
  if (config.provider !== "resend") return null;
  if (!resendClient) resendClient = new Resend(process.env.RESEND_API_KEY);
  return resendClient;
}

/**
 * Nettoie un message d'erreur avant journalisation : retire le mot de passe,
 * le nom d'utilisateur et tronque à 500 caractères. Jamais le stack trace.
 */
export function sanitizeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  let clean = message;
  const secrets = [process.env.EMAIL_PASSWORD, process.env.EMAIL_USER, process.env.RESEND_API_KEY].filter(
    (s): s is string => Boolean(s)
  );
  for (const secret of secrets) {
    if (secret.length > 3) clean = clean.split(secret).join("***");
  }
  return clean.slice(0, 500);
}

/**
 * Envoie un email depuis l'adresse administrateur.
 * Lève une exception si l'envoi échoue (le statut FAILED est géré par l'appelant).
 */
export async function sendEmailFromAdmin(input: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<SendEmailResult> {
  const config = getEmailConfig();
  const to = input.to.trim();

  if (!isValidEmail(to)) {
    throw new Error("Adresse email invalide : " + to);
  }

  if (config.provider === "none") {
    // App non configurée pour l'email : on ne bloque rien, on ignore proprement.
    return { sent: false, skipped: true, reason: "not_configured", to, provider: "none" };
  }

  const date = new Date().toISOString();

  if (config.provider === "smtp") {
    const smtp = getTransporter(config);
    if (!smtp) throw new Error("SMTP non configuré");
    await smtp.sendMail({
      from: getFromHeader(config),
      to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });
    return { sent: true, to, provider: "smtp", date };
  }

  const resend = getResendClient(config);
  if (!resend) throw new Error("Resend non configuré");
  const { error } = await resend.emails.send({
    from: getFromHeader(config),
    to,
    subject: input.subject,
    html: input.html,
  });
  if (error) throw new Error(error.message);
  return { sent: true, to, provider: "resend", date };
}

/**
 * Envoi de l'email "accès accepté".
 * OpenAI n'est qu'une personnalisation optionnelle, jamais bloquante.
 */
export async function sendAuthenticationApprovedEmail(input: {
  to: string;
  firstName: string;
  lastName: string;
}): Promise<SendEmailResult> {
  const config = getEmailConfig();
  let personalizedIntro: string | null = null;
  try {
    personalizedIntro = await personalizeIntro({ firstName: input.firstName, kind: "AUTH_APPROVED" });
  } catch {
    // Ignoré : l'envoi ne dépend pas d'OpenAI.
  }

  const base = (config.appUrl || "https://classdetail.vercel.app").replace(/\/+$/, "");
  const targetUrl = `${base}/dashboard/student`;

  const html = renderAuthenticationApprovedTemplate({
    firstName: input.firstName,
    lastName: input.lastName,
    platformName: config.platformName,
    appUrl: targetUrl,
    adminContactEmail: config.adminContactEmail,
    personalizedIntro,
  });

  return sendEmailFromAdmin({
    to: input.to,
    subject: `Votre accès a été accepté — ${config.platformName}`,
    html,
    text: `Bonjour ${input.firstName},\n\nVotre accès à ${config.platformName} a été accepté. Bienvenue !\n${targetUrl}`,
  });
}

/**
 * Envoi d'un rappel de devoir J-3 ou J-1.
 */
export async function sendAssignmentReminderEmail(input: {
  to: string;
  firstName: string;
  taskTitle: string;
  subjectName: string;
  dueDateLabel: string;
  dueTimeLabel: string;
  daysLeft: "3" | "1";
}): Promise<SendEmailResult> {
  const config = getEmailConfig();
  const kind = input.daysLeft === "1" ? "ASSIGNMENT_1_DAY" : "ASSIGNMENT_3_DAYS";

  let personalizedIntro: string | null = null;
  try {
    personalizedIntro = await personalizeIntro({ firstName: input.firstName, kind });
  } catch {
    // Ignoré : l'envoi ne dépend pas d'OpenAI.
  }

  const data: AssignmentReminderData = {
    firstName: input.firstName,
    taskTitle: input.taskTitle,
    subjectName: input.subjectName,
    dueDateLabel: input.dueDateLabel,
    dueTimeLabel: input.dueTimeLabel,
    daysLeft: input.daysLeft,
    buttonUrl: `${config.appUrl}/dashboard/tasks`,
    platformName: config.platformName,
    personalizedIntro,
  };

  const html = renderAssignmentReminderTemplate(data);

  return sendEmailFromAdmin({
    to: input.to,
    subject:
      input.daysLeft === "1"
        ? "⚠️ Dernier rappel : devoir à rendre demain"
        : "Rappel : devoir à rendre dans 3 jours",
    html,
    text:
      `Bonjour ${input.firstName},\n\n` +
      `${input.taskTitle} (${input.subjectName}) est à rendre le ${input.dueDateLabel} à ${input.dueTimeLabel}.\n` +
      `${input.daysLeft === "1" ? "Il ne reste plus qu'un jour." : "Il vous reste 3 jours."}\n${config.appUrl}`,
  });
}

/**
 * Rappel J-3 (wrappe sendAssignmentReminderEmail).
 */
export function sendAssignmentReminder3Days(input: {
  to: string;
  firstName: string;
  taskTitle: string;
  subjectName: string;
  dueDateLabel: string;
  dueTimeLabel: string;
}): Promise<SendEmailResult> {
  return sendAssignmentReminderEmail({ ...input, daysLeft: "3" });
}

/**
 * Rappel J-1 (wrappe sendAssignmentReminderEmail).
 */
export function sendAssignmentReminder1Day(input: {
  to: string;
  firstName: string;
  taskTitle: string;
  subjectName: string;
  dueDateLabel: string;
  dueTimeLabel: string;
}): Promise<SendEmailResult> {
  return sendAssignmentReminderEmail({ ...input, daysLeft: "1" });
}

export interface TestEmailStep {
  ok: boolean;
  label: string;
  detail?: string;
}

export interface TestEmailResult {
  ok: boolean;
  to: string;
  provider: EmailProvider;
  date?: string;
  steps: TestEmailStep[];
  error?: string;
}

/**
 * Teste la configuration email administrateur :
 *  - SMTP : vérifie la connexion puis envoie un email de test.
 *  - Resend : envoie directement un email de test.
 */
export async function sendTestEmail(to: string): Promise<TestEmailResult> {
  const config = getEmailConfig();
  const steps: TestEmailStep[] = [];

  if (!isValidEmail(to)) {
    return { ok: false, to, provider: config.provider, steps: [], error: "Adresse email invalide." };
  }

  if (config.provider === "none") {
    return {
      ok: false,
      to,
      provider: "none",
      steps: [],
      error:
        "Email non configuré : renseignez EMAIL_HOST, EMAIL_USER, EMAIL_PASSWORD et EMAIL_FROM dans vos variables d'environnement.",
    };
  }

  if (config.provider === "smtp") {
    const smtp = getTransporter(config);
    if (!smtp) {
      return { ok: false, to, provider: "smtp", steps, error: "SMTP non configuré." };
    }
    try {
      await smtp.verify();
      steps.push({ ok: true, label: "Connexion SMTP réussie" });
    } catch (error) {
      steps.push({
        ok: false,
        label: "Échec SMTP",
        detail: sanitizeError(error),
      });
      return { ok: false, to, provider: "smtp", steps, error: sanitizeError(error) };
    }
  }

  const date = new Date();
  try {
    await sendEmailFromAdmin({
      to,
      subject: `Email de test — ${config.platformName}`,
      html: renderTestEmailTemplate(config.platformName),
      text: "Cet email confirme que la configuration email administrateur fonctionne correctement.",
    });
    steps.push({ ok: true, label: "Email envoyé" });
    steps.push({ ok: true, label: "Destinataire", detail: to });
    steps.push({
      ok: true,
      label: "Date",
      detail: date.toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "medium" }),
    });
    return { ok: true, to, provider: config.provider, date: date.toISOString(), steps };
  } catch (error) {
    const clean = sanitizeError(error);
    steps.push({ ok: false, label: "Échec de l'envoi", detail: clean });
    return { ok: false, to, provider: config.provider, steps, error: clean };
  }
}

/** Petit texte de repli si un email HTML est construit sans layout dédié. */
export function simpleHtmlEmail(title: string, bodyHtml: string, platformName?: string): string {
  return emailLayout({ title, bodyHtml, platformName });
}
