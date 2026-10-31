import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";

// ---------------------------------------------------------------------------
// Rendu des réponses de l'assistant PENDANT le streaming SSE vs après
// fermeture/réouverture du panneau (contenu restauré depuis la base).
//
// Le client accumule les fragments `delta` puis affiche `streamed` avec le
// MÊME composant Markdown que pour l'historique : le invariant à garantir
// est donc « texte streamé ≡ texte sauvé », sinon les liens `[Titre](URL)`
// divergent (bug d'origine : le découpage serveur perdait des caractères).
// ---------------------------------------------------------------------------

import { Markdown } from "@/components/assistant/Markdown";
import { chunkForStream } from "@/lib/ai/streamChunks";

function render(content: string, onNavigate?: () => void): string {
  return renderToStaticMarkup(<Markdown content={content} onNavigate={onNavigate} />)
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}

const hrefs = (html: string): string[] =>
  [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]!);

/** Reproduit l'accumulation client : le texte visible après chaque fragment. */
function streamPrefixes(content: string): string[] {
  const prefixes: string[] = [];
  let accumulated = "";
  for (const part of chunkForStream(content)) {
    accumulated += part;
    prefixes.push(accumulated);
  }
  return prefixes;
}

const DRIVE_1 =
  "https://drive.google.com/file/d/1aBcDeFgHiJkLmNoPqRsTuVwXyZ9/view?usp=drive_link";
const DRIVE_2 =
  "https://drive.google.com/file/d/ZyXwVuTsRqPonMlKjIhGfEdCba9/view?usp=drive_link";
const SIMPLE_DRIVE =
  "https://drive.google.com/file/d/SiMpLeCaSe1234/view?usp=drive_link";

const ANSWER = [
  "**Documents trouvés :**",
  "",
  `1. [**Chapitre 1: Introduction Méthodologique à la Formation**](${DRIVE_1}) — type : Document — matière : Mathématiques`,
  `2. [**Exercices corrigés du chapitre**](${DRIVE_2}) — type : Document — matière : Physique`,
  "",
  `Un lien simple : [Ouvrir le document](${SIMPLE_DRIVE}) pour le consulter.`,
  "",
  "- [Voir dans Documents](/dashboard/documents)",
  "- [Voir dans Hints & Sujets](/dashboard/hints)",
].join("\n");

const FINAL_HREFS = new Set(hrefs(render(ANSWER)));

/** Échappe une URL pour l'insérer littérale dans une RegExp (`?`, `.`, etc.). */
const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

describe("Assistant — streaming : le contenu rejoint le contenu restauré", () => {
  it("le texte assemblé fragment par fragment est identique au contenu sauvegardé", () => {
    const prefixes = streamPrefixes(ANSWER);
    // Avec l'ancien découpage serveur, cette égalité échouait (caractères
    // perdus au début des URL longues) : c'est la cause racine du bug.
    expect(prefixes.length).toBeGreaterThan(0);
    expect(prefixes[prefixes.length - 1]).toBe(ANSWER);
  });

  it("le rendu final en streaming est IDENTIQUE au rendu après réouverture", () => {
    const prefixes = streamPrefixes(ANSWER);
    const streamedHtml = render(prefixes[prefixes.length - 1]!);
    const restoredHtml = render(ANSWER);
    expect(streamedHtml).toBe(restoredHtml);
  });
});

describe("Assistant — streaming : liens cliquables à la fin de la génération (sans réouvrir)", () => {
  const html = render(streamPrefixes(ANSWER).slice(-1)[0]!);

  it("garde l'URL Google Drive avec ses paramètres dans un lien nouvel onglet", () => {
    expect(html).toContain(`href="${DRIVE_1}"`);
    expect(html).toContain(`href="${DRIVE_2}"`);
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("rend le titre en gras à l'intérieur du lien", () => {
    expect(html).toMatch(
      new RegExp(
        `<a[^>]*href="${escapeRegExp(DRIVE_1)}"[^>]*><strong[^>]*>Chapitre 1: Introduction Méthodologique à la Formation</strong></a>`
      )
    );
  });

  it("affiche plusieurs liens dans la même réponse", () => {
    const found = hrefs(html);
    expect(found).toContain(DRIVE_1);
    expect(found).toContain(DRIVE_2);
    expect(found).toContain(SIMPLE_DRIVE);
  });

  it("rend la liste et les liens internes du module", () => {
    expect(html).toContain("<li>");
    expect(html).toContain('href="/dashboard/documents"');
    expect(html).toContain('href="/dashboard/hints"');
    expect(html).toContain("Voir dans Documents");
    expect(html).toContain("type : Document");
  });
});

describe("Assistant — streaming : fragments incomplets", () => {
  it("aucun préfixe intermédiaire ne fabrique de lien incomplet", () => {
    for (const prefix of streamPrefixes(ANSWER)) {
      for (const href of hrefs(render(prefix))) {
        // Un lien affiché pendant la génération doit déjà être un lien
        // complet et réellement présent dans la réponse finale.
        expect(FINAL_HREFS.has(href)).toBe(true);
      }
    }
  });

  it("réponse interrompue au milieu d'un lien : texte conservé, aucun lien cassé", () => {
    const cut = ANSWER.slice(0, ANSWER.indexOf("/view?usp=drive_link") + 4);
    const html = render(cut);

    // Le fragment incomplet reste lisible (jamais supprimé)…
    expect(html).toContain("Chapitre 1: Introduction Méthodologique");
    expect(html).toContain("drive.google.com");
    // …mais ne devient pas un lien cliquable tant qu'il n'est pas complet.
    expect(hrefs(html)).toEqual([]);
    expect(html).not.toContain('target="_blank"');
  });

  it("toute coupe possible de la réponse reste rendue sans erreur ni lien fabriqué", () => {
    for (let i = 1; i < ANSWER.length; i++) {
      const html = render(ANSWER.slice(0, i));
      expect(typeof html).toBe("string");
      for (const href of hrefs(html)) {
        expect(FINAL_HREFS.has(href)).toBe(true);
      }
    }
  });
});

describe("Assistant — réponse restaurée depuis l'historique", () => {
  const html = render(ANSWER);

  it("présente les mêmes liens cliquables que la fin du streaming", () => {
    expect(hrefs(html).sort()).toEqual([...FINAL_HREFS.keys()].sort());
    expect(html).toContain(`href="${DRIVE_1}"`);
    expect(html).toContain(`href="${DRIVE_2}"`);
    expect(html).toContain('target="_blank"');
  });

  it("reste interprétée : gras, listes et liens internes conservés", () => {
    expect(html).toMatch(/<strong[^>]*>Documents trouvés :<\/strong>/);
    expect(html).toContain("<li>");
    expect(html).toContain('href="/dashboard/documents"');
    // Le lien interne du module ne s'ouvre jamais dans un nouvel onglet.
    const internalAnchor = html.match(/<a[^>]*href="\/dashboard\/documents"[^>]*>/)?.[0] ?? "";
    expect(internalAnchor).not.toContain('target="_blank"');
  });
});
