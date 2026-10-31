/**
 * Garde-fou de liens dans les réponses de l'assistant ClassPulse.
 *
 * Principe : une URL n'est affichée comme lien QUE si elle est réelle.
 *  - la liste « autorisée » est alimentée par les URLs réellement lues en base
 *    (résultats des outils) et par l'historique de la conversation (produit
 *    lui-même par les outils lors des tours précédents) ;
 *  - les liens internes doivent appartenir à la liste blanche des modules ;
 *  - les liens vers des fichiers (Google Drive / Docs) doivent être dans la
 *    liste autorisée, sinon seul le libellé est conservé (plus de lien) ;
 *  - les autres liens externes (non ressources) ne sont pas filtrés ici : la
 *    règle « n'invente jamais d'URL » reste portée par le prompt système.
 *
 * Fonctions pures, testées dans tests/assistantLinks.test.ts.
 */

import { isAllowedAssistantHref } from "@/lib/ai/tools";

/** Hôtes de fichiers gérés par ClassPulse (cf. driveUrlSchema en écriture). */
const RESOURCE_HOSTS = ["drive.google.com", "docs.google.com"];

/** Vrai si l'URL pointe vers un fichier externe du type de ceux de ClassPulse. */
export function isResourceFileUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    const host = parsed.hostname.replace(/^www\./, "");
    return RESOURCE_HOSTS.includes(host);
  } catch {
    return false;
  }
}

const URL_RE = /\bhttps?:\/\/[^\s)\]>"'`]+/g;
const MARKDOWN_LINK_RE = /\[([^\]\n]+)\]\(([^)\s]+)\)/g;

/** Extrait les URLs d'un texte, en retirant la ponctuation finale. */
export function extractUrls(text: string): string[] {
  const out: string[] = [];
  for (const match of text.matchAll(URL_RE)) {
    const url = match[0].replace(/[.,;:!?]+$/, "");
    if (url && !out.includes(url)) out.push(url);
  }
  return out;
}

/** Agrège les URLs présentes dans des messages (historique ou résultats d'outils). */
export function collectUrlsFromMessages(messages: Array<{ content?: string | null }>): string[] {
  const out: string[] = [];
  for (const message of messages) {
    if (!message?.content) continue;
    for (const url of extractUrls(message.content)) {
      if (!out.includes(url)) out.push(url);
    }
  }
  return out;
}

/**
 * Nettoie les liens d'une réponse :
 *  - lien interne hors liste blanche → seul le libellé est conservé ;
 *  - lien vers un fichier non autorisé (URL inconnue des outils) → idem ;
 *  - URL de fichier nue non autorisée → supprimée (la ponctuation est gardée).
 */
export function sanitizeAssistantLinks(content: string, allowedUrls: Iterable<string>): string {
  const allowed = new Set(allowedUrls);

  const withLinks = content.replace(MARKDOWN_LINK_RE, (full, label: string, rawUrl: string) => {
    const url = rawUrl.trim();
    if (url.startsWith("/")) {
      // Lien interne : chemin exact de la liste blanche (ni query, ni hash).
      const [pathname, ...rest] = url.split(/[?#]/);
      return rest.length === 0 && pathname === url && isAllowedAssistantHref(url) ? full : label;
    }
    if (isResourceFileUrl(url)) return allowed.has(url) ? full : label;
    return full;
  });

  return withLinks.replace(URL_RE, (raw) => {
    if (isResourceFileUrl(raw)) {
      if (allowed.has(raw)) return raw;
      const trimmed = raw.replace(/[.,;:!?]+$/, "");
      return allowed.has(trimmed) ? raw : raw.slice(trimmed.length);
    }
    return raw;
  });
}
