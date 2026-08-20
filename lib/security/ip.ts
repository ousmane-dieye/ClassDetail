import { headers } from "next/headers";

/**
 * Extrait l'adresse IP du client depuis les en-têtes HTTP de la requête.
 * Gère les proxys Vercel, Cloudflare, Nginx (x-forwarded-for, x-real-ip, cf-connecting-ip).
 */
export function getClientIp(): string {
  try {
    const headerList = headers();
    const xff = headerList.get("x-forwarded-for");
    if (xff) {
      // x-forwarded-for peut contenir une liste d'IPs séparées par une virgule ("client, proxy1, proxy2")
      const clientIp = xff.split(",")[0].trim();
      if (clientIp) return clientIp;
    }
    const realIp = headerList.get("x-real-ip");
    if (realIp && realIp.trim()) {
      return realIp.trim();
    }
    const cfIp = headerList.get("cf-connecting-ip");
    if (cfIp && cfIp.trim()) {
      return cfIp.trim();
    }
  } catch {
    // Hors contexte de requête HTTP (ex. tests unitaires)
  }
  return "127.0.0.1";
}
