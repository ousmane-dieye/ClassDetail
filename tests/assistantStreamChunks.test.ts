import { describe, it, expect } from "vitest";
import { chunkForStream, STREAM_CHUNK_SIZE } from "@/lib/ai/streamChunks";

// ---------------------------------------------------------------------------
// Régression — découpage SSE du serveur (route /api/assistant).
//
// Le serveur sauvegarde `reply.content` en base PUIS le streame en fragments.
// Le client accumule ces fragments et les rend avec le composant Markdown :
// si un fragment perd des caractères, la syntaxe `[Titre](URL)` est cassée
// pendant le streaming, alors que la version restaurée depuis la base
// (après fermeture/réouverture du panneau) reste complète et cliquable.
//
// L'ancien découpage `text.match(/.{1,24}(\s|$)/gs)` perdait effectivement
// des caractères : avec /g, les positions de départ sans correspondance
// possible sont sautées, ce qui ampute le début d'un long jeton sans espace
// (une URL Google Drive en fait partie). On reproduit ici la perte observée,
// puis on garantit que le découpage corrigé est sans perte.
// ---------------------------------------------------------------------------

/** Ancien comportement du serveur (conservé ici uniquement pour la reproduction). */
function legacyChunks(text: string): string {
  return (text.match(/.{1,24}(\s|$)/gs) ?? [text]).join("");
}

const DRIVE_URL =
  "https://drive.google.com/file/d/1aBcDeFgHiJkLmNoPqRsTuVwXyZ/view?usp=drive_link";

const BUG_SAMPLE =
  "Voici le document : [**Chapitre 1: Introduction Methodologique a la Formation**]" +
  `(${DRIVE_URL}) bonne lecture.`;

const CONTENTS: Array<[label: string, content: string]> = [
  ["lien simple", `Lire ici : [Ouvrir le document](${DRIVE_URL}).`],
  ["lien avec titre en gras", `[**Chapitre 1: Introduction Méthodologique**](${DRIVE_URL})`],
  ["plusieurs liens dans la même réponse",
    `1. [**Premier**](${DRIVE_URL})\n2. [**Second**](https://drive.google.com/file/d/ZyXwVuTsRqPonMlKjIhGfEdCba9/view?usp=drive_link)\n- [Voir dans Documents](/dashboard/documents)`],
  ["réponse avec liste et liens",
    "**Documents trouvés :**\n\n1. [**Un titre assez long pour dépasser la fenêtre de découpe**](https://drive.google.com/file/d/AbCdEfGhIjKlMnOpQrStUvWxYz/view?usp=drive_link) — Document\n2. [**Deuxième ressource**](https://drive.google.com/file/d/9zYxWvUtSrQpOnMlKjIhGfEdCb/view?usp=drive_link) — Hint\n\n- [Voir dans Hints & Sujets](/dashboard/hints)"],
  ["texte courant (gras, italique, code, titres)",
    "## Résumé\n\nVoici **un gras** et *un italique* avec `du code` :\n\n- élément un\n- élément deux\n\n> une citation pour terminer."],
  ["URL longue seule", DRIVE_URL],
  ["sans espace sur une longue distance", "x".repeat(120)],
  ["accents et emoji", "👏 Bravo 👏 ! ".repeat(12) + `Terminé → [lien](${DRIVE_URL})`],
  ["chaîne vide", ""],
];

describe("chunkForStream — réassemblage strictement identique (perte zéro)", () => {
  it.each(CONTENTS)("%s : la concaténation reproduit exactement le texte", (_label, content) => {
    expect(chunkForStream(content).join("")).toBe(content);
  });

  it("reproduit la perte de caractères de l'ancien découpage (cause du bug)", () => {
    // Constats d'origine : l'ancien regex rendait 99 caractères pour 176.
    const legacy = legacyChunks(BUG_SAMPLE);
    expect(legacy).not.toBe(BUG_SAMPLE);
    expect(legacy.length).toBeLessThan(BUG_SAMPLE.length);
    // Le lien Google Drive y était tronqué : impossible à rendre cliquable.
    expect(legacy).not.toContain(DRIVE_URL);

    // Le découpage corrigé ne perd rien : le lien streamé est intact.
    expect(chunkForStream(BUG_SAMPLE).join("")).toBe(BUG_SAMPLE);
    expect(chunkForStream(BUG_SAMPLE).join("")).toContain(DRIVE_URL);
  });

  it(`chaque fragment contient au plus ${STREAM_CHUNK_SIZE} points de code`, () => {
    for (const [, content] of CONTENTS) {
      for (const chunk of chunkForStream(content)) {
        expect(Array.from(chunk).length).toBeLessThanOrEqual(STREAM_CHUNK_SIZE);
      }
    }
  });

  it("ne produit jamais de fragment vide et progresse toujours", () => {
    for (const [, content] of CONTENTS) {
      const chunks = chunkForStream(content);
      expect(chunks.every((c) => c.length > 0)).toBe(true);
      // Au moins un fragment toutes les `STREAM_CHUNK_SIZE` unités —
      // comptées en points de code, comme dans chunkForStream.
      expect(chunks.length).toBeGreaterThanOrEqual(
        Math.ceil(Array.from(content).length / STREAM_CHUNK_SIZE)
      );
      expect(chunks.length).toBeLessThanOrEqual(content.length);
    }
  });

  it("rompt sur les espaces pour un rendu « frappe » naturel", () => {
    const prose =
      "Bonjour, voici une réponse assez longue pour être découpée en plusieurs fragments " +
      "pendant le streaming de l'assistant IA ClassPulse, du début jusqu'à la fin de la phrase.";
    const chunks = chunkForStream(prose);
    expect(chunks.slice(0, -1).every((c) => /\s$/.test(c))).toBe(true);
    expect(chunks.join("")).toBe(prose);
  });

  it("ne coupe jamais une paire de substitution (emoji) en deux", () => {
    const content = "👋 ".repeat(40) + `fin ${DRIVE_URL}`;
    const chunks = chunkForStream(content);
    const hasLoneSurrogate = (s: string): boolean => {
      for (let i = 0; i < s.length; i++) {
        const c = s.charCodeAt(i);
        if (c >= 0xd800 && c <= 0xdbff) {
          const next = s.charCodeAt(i + 1);
          if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
          i++;
        } else if (c >= 0xdc00 && c <= 0xdfff) {
          return true;
        }
      }
      return false;
    };
    // Un fragment mal formé afficherait un caractère de remplacement à
    // l'écran entre deux fragments : c'est donc à la frontière à éviter.
    expect(chunks.some((c) => hasLoneSurrogate(c))).toBe(false);
    expect(chunks.join("")).toBe(content);
  });

  it("reste correct avec des tailles limites ou invalides (pas de boucle infinie)", () => {
    const content = `Un texte avec ${DRIVE_URL} dedans.`;
    expect(chunkForStream("")).toEqual([]);
    expect(chunkForStream("a")).toEqual(["a"]);
    expect(chunkForStream(content, 1).join("")).toBe(content);
    expect(chunkForStream(content, 1).every((c) => c.length === 1)).toBe(true);
    // maxChars <= 0 : plafonné à 1 caractère, jamais de boucle infinie.
    expect(chunkForStream(content, 0).join("")).toBe(content);
    expect(chunkForStream("x".repeat(10_000)).join("")).toBe("x".repeat(10_000));
  });
});
