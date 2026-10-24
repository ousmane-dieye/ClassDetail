/**
 * DISPATCH D'EMAILS PÉDAGOGIQUES — orchestration « par catégorie » :
 *
 *   destinataires (déjà filtrés sur la préférence « e-mail »)
 *     → anti-doublon (une seule requête pour tout le lot)
 *     → émission via le service central unique (lib/email/emailService)
 *     → enregistrement SENT / FAILED (table assignment_email_notifications)
 *
 * Ce module ne crée AUCUN transport parallèle et n'écrit jamais « SENT » si
 * le fournisseur n'a pas accepté l'envoi. Un canal désactivé ou un fournisseur
 * non configuré n'est JAMAIS compté comme une erreur.
 *
 * ⚠️ Module serveur uniquement (lib/supabase/admin + lib/email/emailService).
 */

import {
  getEmailConfig,
  isValidEmail,
  sanitizeError,
  sendEmailFromAdmin,
} from "@/lib/email/emailService";
import { renderClassEventTemplate } from "@/lib/email/templates";
import {
  findAlreadySentUserIds,
  recordEmailNotifications,
  type RecordEmailNotificationInput,
} from "@/lib/email/notifications";
import type { EmailNotificationType } from "@/types/database.types";

/** Nombre d'envois simultanés (limite les connexions SMTP ouvertes d'un coup). */
const SEND_CONCURRENCY = 5;

export interface ClassEmailRecipient {
  id: string;
  email: string | null | undefined;
  firstName?: string | null;
}

export interface SendClassEventEmailsInput {
  /** Destinataires dont la préférence « e-mail » est active pour la catégorie. */
  recipients: ClassEmailRecipient[];
  /** Type d'événement (sert aussi de clé d'anti-doublon). */
  type: EmailNotificationType;
  /** Objet du mail (défaut : titre de l'événement — nom de la plateforme). */
  subject?: string;
  /** Titre affiché dans le corps du mail. */
  heading: string;
  /** Message réel de l'événement (aucune donnée inventée). */
  message: string;
  /** Lien absolu vers l'événement (optionnel). */
  buttonUrl?: string | null;
  buttonLabel?: string;
  /** Clé d'anti-doublon : devoir (FK) ou entité polymorphe. */
  assignmentId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
}

export interface ClassEmailDispatchResult {
  sent: number;
  skipped: number;
  failed: number;
  errors: string[];
}

function absoluteUrl(path: string | null | undefined, appUrl: string): string | null {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return `${appUrl.replace(/\/+$/, "")}${path.startsWith("/") ? "" : "/"}${path}`;
}

export async function sendClassEventEmails(
  input: SendClassEventEmailsInput
): Promise<ClassEmailDispatchResult> {
  const result: ClassEmailDispatchResult = { sent: 0, skipped: 0, failed: 0, errors: [] };
  if (input.recipients.length === 0) return result;

  const config = getEmailConfig();

  // Fournisseur non configuré : on n'envoie rien et on n'enregistre rien
  // (l'application continue de fonctionner sans email).
  if (config.provider === "none") {
    result.skipped += input.recipients.length;
    return result;
  }

  // Anti-doublon : une seule requête pour tous les destinataires.
  // Sans clé métier (devoir ou entité) impossible — cas nominal jamais atteint
  // car tout événement notifié porte son entité — on envoie sans trace plutôt
  // que d'écrire une ligne non déduplicable (et donc rejetée par les index).
  const hasKey = Boolean(input.assignmentId) || Boolean(input.entityId && input.entityType);
  const alreadySent = hasKey
    ? await findAlreadySentUserIds({
        type: input.type,
        userIds: input.recipients.map((r) => r.id),
        assignmentId: input.assignmentId ?? null,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
      })
    : new Set<string>();
  const record = hasKey;

  const buttonUrl = absoluteUrl(input.buttonUrl, config.appUrl);
  const settingsUrl = absoluteUrl("/dashboard/settings/notifications", config.appUrl);
  const renderHtml = (firstName: string | null | undefined) =>
    renderClassEventTemplate({
      firstName,
      heading: input.heading,
      message: input.message,
      buttonUrl,
      buttonLabel: input.buttonLabel ?? "Voir dans ClassPulse",
      settingsUrl,
      platformName: config.platformName,
    });
  const text =
    `${input.heading}\n\n${input.message}\n` +
    (buttonUrl ? `${buttonUrl}\n` : "") +
    `${config.appUrl}/dashboard/settings/notifications`;

  const subject = input.subject ?? `${input.heading} — ${config.platformName}`;
  const records: RecordEmailNotificationInput[] = [];

  const queue = [...input.recipients];
  while (queue.length > 0) {
    const batch = queue.splice(0, SEND_CONCURRENCY);
    await Promise.all(
      batch.map(async (recipient) => {
        const base = {
          assignmentId: input.assignmentId ?? null,
          userId: recipient.id,
          email: (recipient.email ?? "").trim(),
          type: input.type,
          entityType: input.entityType ?? null,
          entityId: input.entityId ?? null,
        };

        if (alreadySent.has(recipient.id)) {
          result.skipped++;
          return;
        }

        if (!isValidEmail(base.email)) {
          result.failed++;
          if (record) records.push({ ...base, status: "FAILED", errorMessage: "Adresse email invalide" });
          return;
        }

        try {
          await sendEmailFromAdmin({ to: base.email, subject, html: renderHtml(recipient.firstName), text });
          result.sent++;
          if (record) records.push({ ...base, status: "SENT" });
        } catch (error) {
          const clean = sanitizeError(error);
          result.failed++;
          result.errors.push(`${input.type} → ${base.email} : ${clean}`);
          if (record) records.push({ ...base, status: "FAILED", errorMessage: clean });
        }
      })
    );
  }

  if (records.length > 0) {
    try {
      await recordEmailNotifications(records);
    } catch (error) {
      // Un échec d'enregistrement (ex. index unique atteint par une course)
      // ne doit jamais faire échouer l'action métier — la trace manquante est
      // journalisée, les emails déjà acceptés restent envoyés.
      console.error(
        "EmailDispatch : enregistrement des résultats impossible (%s) : %s",
        input.type,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  return result;
}
