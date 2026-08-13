/**
 * Templates HTML transactionnels — responsifs et compatibles Gmail, Outlook
 * et les clients courants :
 *   - structure à base de <table> + inline styles (Outlook/Gmail ignorent les
 *     classes CSS) ;
 *   - largeur max 600px, MSO conditional comment pour Outlook desktop ;
 *   - couleurs via des variables au niveau du layout (pas de secrets ici).
 */

export interface EmailLayoutOptions {
  title: string;
  bodyHtml: string;
  platformName?: string;
  footerText?: string;
}

export function emailLayout({
  title,
  bodyHtml,
  platformName = "ClassPulse",
  footerText,
}: EmailLayoutOptions): string {
  const footer = footerText ?? `Vous recevez cet email automatiquement depuis ${platformName}. Aucune réponse requise.`;

  return `<!DOCTYPE html>
<html lang="fr" xmlns:v="urn:schemas-microsoft-com:vml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="x-apple-disable-message-reformatting">
<title>${title}</title>
<!--[if mso]>
<noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
<![endif]-->
<style>
  .ExternalClass, .ExternalClass p, .ExternalClass span, .ExternalClass font, .ExternalClass td { line-height: 100%; }
  body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
  table { border-collapse: collapse; mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
  img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
</style>
</head>
<body style="margin:0;padding:0;background-color:#f4f6f9;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
  <!--[if mso]>
  <center><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" align="center"><tr><td>
  <![endif]-->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" align="center" style="background-color:#f4f6f9;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 14px rgba(15,23,42,0.08);">
          <tr>
            <td style="background-color:#1d4ed8;padding:24px 32px;text-align:center;">
              <span style="font-size:20px;font-weight:bold;color:#ffffff;letter-spacing:0.5px;">${platformName}</span>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <h1 style="margin:0 0 16px 0;font-size:22px;line-height:1.3;color:#111827;">${title}</h1>
              <div style="font-size:15px;line-height:1.7;color:#1f2937;">
                ${bodyHtml}
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px;background-color:#f8fafc;border-top:1px solid #e2e8f0;">
              <p style="margin:0;font-size:12px;line-height:1.6;color:#64748b;text-align:center;">${footer}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
  <!--[if mso]>
  </td></tr></table></center>
  <![endif]-->
</body>
</html>`;
}

/** Bouton plein largeur, inline styles (Gmail/Outlook). */
export function emailButton(href: string, label: string): string {
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td align="center" style="padding:8px 0 4px 0;">
        <a href="${href}" target="_blank" rel="noopener noreferrer"
           style="display:inline-block;background-color:#1d4ed8;color:#ffffff;font-size:15px;font-weight:bold;
                  text-decoration:none;padding:12px 28px;border-radius:8px;mso-padding-alt:0;">
          ${label}
        </a>
      </td>
    </tr>
  </table>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export interface AuthenticationApprovedData {
  firstName: string;
  lastName: string;
  platformName: string;
  appUrl: string;
  adminContactEmail: string;
  /** Ligne d'introduction personnalisée (optionnelle, via OpenAI). */
  personalizedIntro?: string | null;
}

export function renderAuthenticationApprovedTemplate(data: AuthenticationApprovedData): string {
  const { firstName, lastName, platformName, appUrl, adminContactEmail, personalizedIntro } = data;
  const intro =
    personalizedIntro ||
    `Bonjour ${escapeHtml(firstName)},<br/><br/>Votre demande d'accès à la plateforme <strong>${escapeHtml(
      platformName
    )}</strong> a été <strong>acceptée</strong>. Votre compte est maintenant actif.`;

  return emailLayout({
    title: "Votre accès a été accepté",
    platformName,
    bodyHtml: `
      <p>${intro}</p>
      <p>Bienvenue parmi nous, <strong>${escapeHtml(firstName)} ${escapeHtml(lastName)}</strong> ! Vous pouvez dès maintenant
      vous connecter et accéder à vos classes, devoirs, ressources et au chat de votre classe.</p>
      <p style="margin-bottom:4px;">Accéder à la plateforme :</p>
      ${emailButton(appUrl, "Se connecter")}
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;"/>
      <p style="margin:0;font-size:13px;color:#475569;">
        Pour toute question ou besoin d'assistance, contactez l'administration :
        <a href="mailto:${escapeHtml(adminContactEmail)}" style="color:#1d4ed8;text-decoration:underline;">${escapeHtml(
          adminContactEmail
        )}</a>
      </p>`,
  });
}

export interface AssignmentReminderData {
  firstName: string;
  taskTitle: string;
  subjectName: string;
  dueDateLabel: string;
  dueTimeLabel: string;
  daysLeft: "3" | "1";
  buttonUrl: string;
  platformName: string;
  personalizedIntro?: string | null;
}

export function renderAssignmentReminderTemplate(data: AssignmentReminderData): string {
  const { firstName, taskTitle, subjectName, dueDateLabel, dueTimeLabel, daysLeft, buttonUrl, platformName, personalizedIntro } =
    data;
  const isJ1 = daysLeft === "1";
  const intro =
    personalizedIntro ||
    (isJ1
      ? `Bonjour ${escapeHtml(firstName)},<br/><br/><strong>Attention</strong>, votre devoir va arriver à échéance demain.`
      : `Bonjour ${escapeHtml(firstName)},<br/><br/>Nous vous rappelons que votre devoir approche.`);

  return emailLayout({
    title: isJ1 ? "⚠️ Dernier rappel : devoir à rendre demain" : "Rappel : devoir à rendre dans 3 jours",
    platformName,
    bodyHtml: `
      <p>${intro}</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;margin:20px 0;">
        <tr>
          <td style="padding:16px 20px;font-size:15px;line-height:1.7;">
            <p style="margin:0 0 4px 0;"><strong>${escapeHtml(taskTitle)}</strong></p>
            <p style="margin:0 0 12px 0;color:#475569;">Matière : ${escapeHtml(subjectName)}</p>
            <p style="margin:0;color:#111827;"><strong>Date limite :</strong> ${dueDateLabel} à ${dueTimeLabel}</p>
          </td>
        </tr>
      </table>
      <p style="margin:0 0 4px 0;">${isJ1 ? "Il ne reste plus qu'un jour pour le rendre." : "Il vous reste 3 jours pour le rendre."}</p>
      ${emailButton(buttonUrl, "Voir le devoir")}
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;"/>
      <p style="margin:0;font-size:13px;color:#475569;">
        Cordialement,<br/>L'administration<br/><strong>${escapeHtml(platformName)}</strong>
      </p>`,
  });
}

export function renderTestEmailTemplate(platformName: string): string {
  return emailLayout({
    title: "Email de test réussi",
    platformName,
    bodyHtml: `
      <p>Cet email confirme que la configuration <strong>email administrateur</strong> fonctionne correctement.</p>
      <p style="margin:0;font-size:14px;color:#475569;">
        - Connexion SMTP réussie<br/>
        - Email envoyé depuis l'adresse de l'administration<br/>
        - Destinataire : l'adresse de l'administration
      </p>`,
  });
}
