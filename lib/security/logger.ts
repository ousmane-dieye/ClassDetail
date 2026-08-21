/**
 * Journalisation de sécurité pour l'authentification ClassPulse.
 * 
 * RÈGLES STRICTES DE SÉCURITÉ :
 * - Jamais de mot de passe, token, access token, refresh token ou cookie dans les logs.
 * - Anonymisation systématique des emails et des adresses IP.
 * - Formatage standardisé pour intégration facile avec des outils SIEM ou Vercel Logs.
 */

export type SecurityEventType =
  | "AUTH_LOGIN_SUCCESS"
  | "AUTH_LOGIN_FAILED"
  | "AUTH_RATE_LIMITED"
  | "AUTH_CAPTCHA_REQUIRED"
  | "AUTH_CAPTCHA_FAILED"
  | "AUTH_PASSWORD_RESET_REQUESTED"
  | "AUTH_PASSWORD_RESET_RATE_LIMITED";

export interface SecurityEventDetails {
  ip?: string;
  email?: string;
  userId?: string;
  bucket?: string;
  reason?: string;
}

/**
 * Anonymise un email pour le rendre méconnaissable dans les logs.
 * Exemple: "ousmane.dieye@gmail.com" -> "o***e@g***.com"
 */
export function anonymizeEmail(email: string): string {
  if (!email || !email.includes("@")) return "***@***";
  const [local = "", domain = ""] = email.trim().toLowerCase().split("@");

  const anonLocal =
    local.length <= 2
      ? `${local[0] ?? "*"}*`
      : `${local[0] ?? "*"}***${local[local.length - 1] ?? "*"}`;

  const domainParts = domain.split(".");
  const mainDomain = domainParts[0] ?? "";
  const ext = domainParts.slice(1).join(".");

  const anonDomain =
    mainDomain.length <= 2
      ? `${mainDomain[0] ?? "*"}*`
      : `${mainDomain[0] ?? "*"}***${mainDomain[mainDomain.length - 1] ?? "*"}`;

  return `${anonLocal}@${anonDomain}${ext ? `.${ext}` : ""}`;
}

/**
 * Masque les derniers octets d'une adresse IP pour préserver la vie privée dans les logs.
 * Exemple IPv4: "192.168.1.50" -> "192.168.1.xxx"
 */
export function anonymizeIp(ip: string): string {
  if (!ip) return "xxx.xxx.xxx.xxx";
  if (ip.includes(".")) {
    const parts = ip.split(".");
    if (parts.length === 4) {
      return `${parts[0] ?? "xxx"}.${parts[1] ?? "xxx"}.${parts[2] ?? "xxx"}.xxx`;
    }
  }
  if (ip.includes(":")) {
    const parts = ip.split(":");
    return parts.slice(0, Math.min(3, parts.length)).join(":") + ":xxxx";
  }
  return "xxx.xxx.xxx.xxx";
}

/**
 * Consigne un événement de sécurité d'authentification.
 */
export function logSecurityEvent(event: SecurityEventType, details: SecurityEventDetails = {}): void {
  const timestamp = new Date().toISOString();
  const anonIp = details.ip ? anonymizeIp(details.ip) : "unknown";
  const anonEm = details.email ? anonymizeEmail(details.email) : "n/a";

  const logPayload = {
    timestamp,
    event,
    ip: anonIp,
    email: anonEm,
    userId: details.userId ? details.userId.slice(0, 8) + "..." : undefined,
    bucket: details.bucket,
    reason: details.reason,
  };

  const message = `[SECURITY_AUDIT] [${event}] ip=${anonIp} email=${anonEm}${details.bucket ? ` bucket=${details.bucket}` : ""}${details.reason ? ` reason="${details.reason}"` : ""}`;

  switch (event) {
    case "AUTH_RATE_LIMITED":
    case "AUTH_CAPTCHA_FAILED":
    case "AUTH_PASSWORD_RESET_RATE_LIMITED":
      console.warn(message, logPayload);
      break;
    case "AUTH_LOGIN_FAILED":
    case "AUTH_CAPTCHA_REQUIRED":
    case "AUTH_PASSWORD_RESET_REQUESTED":
    case "AUTH_LOGIN_SUCCESS":
    default:
      console.info(message, logPayload);
      break;
  }
}
