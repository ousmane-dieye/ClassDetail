/**
 * Découpage d'une réponse de l'assistant en fragments pour l'effet « frappe »
 * envoyé en SSE (`data: {"type":"delta","text":"..."}`).
 *
 * Contrainte absolue : `chunkForStream(text).join("")` doit être STRICTEMENT
 * égal à `text`. Le client interprète ce texte au fil de l'eau avec le
 * composant Markdown (liens `[Titre](URL)`, gras, listes…) : un seul
 * caractère perdu casse la syntaxe pendant le streaming, alors que le contenu
 * sauvegardé en base — rechargé après fermeture/réouverture du panneau —
 * reste intact. C'est exactement le bug de rendu que ce module corrige.
 *
 * L'implémentation précédente, `text.match(/.{1,24}(\s|$)/gs)`, perdait des
 * caractères : avec le drapeau /g, les positions de départ sans alternative
 * possible sont sautées, ce qui ampute le début d'un long jeton sans espace
 * (une URL Google Drive en fait partie : ~70 caractères sans espace).
 * Reproduction dans tests/assistantStreamChunks.test.ts.
 *
 * Fonction pure — testée dans tests/assistantStreamChunks.test.ts.
 */

/** Taille (en points de code) d'un fragment envoyé au client. */
export const STREAM_CHUNK_SIZE = 24;

/**
 * Découpe `text` en fragments d'au plus `maxChars` points de code.
 *
 * - perte nulle : la concaténation des fragments rend `text` à l'identique ;
 * - césure sur un espace quand la fenêtre en contient un (« frappe »
 *   naturelle, on coupe entre mots) sinon au milieu du jeton — une URL longue
 *   se construit alors par morceaux, sans jamais perdre de caractère ;
 * - jamais de coupure au milieu d'une paire de substitution (emoji) :
 *   chaque fragment reste une chaîne bien formée ;
 * - progresse toujours d'au moins un caractère (pas de boucle infinie).
 */
export function chunkForStream(text: string, maxChars = STREAM_CHUNK_SIZE): string[] {
  if (text === "") return [];

  const size = Math.max(1, Math.floor(maxChars));
  const chars = Array.from(text); // points de code : ne coupe pas un emoji
  const chunks: string[] = [];
  let start = 0;

  while (start < chars.length) {
    let end = Math.min(start + size, chars.length);

    if (end < chars.length) {
      // Dernier espace de la fenêtre (inclus) → fin de mot naturelle.
      for (let i = end - 1; i > start; i--) {
        if (/\s/.test(chars[i]!)) {
          end = i + 1;
          break;
        }
      }
    }

    chunks.push(chars.slice(start, end).join(""));
    start = end;
  }

  return chunks;
}
