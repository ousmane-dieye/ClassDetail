import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";

// ---------------------------------------------------------------------------
// Tests de rendu des réponses de l'assistant (node env, sans DOM) :
//  - le titre en gras est bien à l'intérieur d'un lien cliquable ;
//  - le lien du fichier s'ouvre dans un nouvel onglet (comportement ClassPulse) ;
//  - le lien interne du module reste interne (navigation dans l'app) ;
//  - les URL non autorisées (javascript:, etc.) ne deviennent jamais de lien.
// ---------------------------------------------------------------------------

import { Markdown } from "@/components/assistant/Markdown";

function render(content: string, onNavigate?: () => void): string {
  return renderToStaticMarkup(<Markdown content={content} onNavigate={onNavigate} />)
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}

const SEARCH_RESULT =
  "1. [**Introduction aux pointeurs en langage C**](https://drive.google.com/file/d/ABC123/view) — " +
  "type : Document — matière : Programmation C — [Voir dans Documents](/dashboard/documents)";

describe("Markdown — liens de ressources de l'assistant", () => {
  it("rend le titre en gras à l'intérieur d'un lien vers le fichier réel", () => {
    const html = render(SEARCH_RESULT);

    expect(html).toContain('href="https://drive.google.com/file/d/ABC123/view"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toMatch(
      /<a[^>]*href="https:\/\/drive\.google\.com\/file\/d\/ABC123\/view"[^>]*><strong[^>]*>Introduction aux pointeurs en langage C<\/strong><\/a>/
    );
  });

  it("affiche type et matière dans la même ligne, avec le lien interne du module", () => {
    const html = render(SEARCH_RESULT);

    expect(html).toContain("type : Document");
    expect(html).toContain("matière : Programmation C");
    expect(html).toContain('href="/dashboard/documents"');
    expect(html).toContain("Voir dans Documents");
  });

  it("le lien interne n'ouvre pas d'onglet (navigation ClassPulse)", () => {
    const html = render("[Voir mes documents](/dashboard/documents)");
    expect(html).not.toContain('target="_blank"');
    expect(html).toContain('href="/dashboard/documents"');
  });

  it("ne transforme jamais une URL dangereuse en lien", () => {
    const html = render("Ceci [n'est pas un lien](javascript:alert(1)) et ça [non](data:text/html,x).");
    expect(html).not.toContain("<a ");
    expect(html).toContain("n'est pas un lien");
    expect(html).toContain("non");
  });

  it("affiche le message d'absence de résultat sans aucun lien", () => {
    const html = render(
      "Je n'ai pas trouvé de ressource correspondant à ta recherche dans les documents auxquels tu as accès. " +
        "Tu peux essayer avec un autre titre ou une autre matière."
    );
    expect(html).not.toContain("<a ");
    expect(html).toContain("Je n'ai pas trouvé de ressource correspondant à ta recherche");
  });

  it("reste lisible : gras, listes et code conservés", () => {
    const html = render("**Gras** et `code` :\n- élément 1\n- élément 2");
    expect(html).toMatch(/<strong[^>]*>Gras<\/strong>/);
    expect(html).toMatch(/<code[^>]*>code<\/code>/);
    expect(html).toContain("<li>élément 1</li>");
    expect(html).toContain("<li>élément 2</li>");
  });
});
