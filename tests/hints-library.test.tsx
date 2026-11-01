import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";

// ---------------------------------------------------------------------------
// Tests interface — bibliothèque « Hints & Sujets ». Rendu SSR des états :
//  node env sans DOM, on vérifie donc le contenu affiché, la présence de la
//  barre de recherche et du sélecteur de tri (4 libellés), les compteurs, la
//  recherche active appliquée au rendu, et la conservation des permissions
//  (suppression réservée aux ressources où `canDelete` est true, précalculé
//  côté serveur). Les tests de logique (recherche, accents, tris,
//  combinaison) sont dans tests/hints-listing.test.ts.
// ---------------------------------------------------------------------------

import { HintsLibrary } from "@/components/hints/HintsLibrary";
import { HINT_SORT_OPTIONS, type HintListItem } from "@/lib/hints/listing";

/** Les apostrophes/quotes sont encodées en HTML dans le rendu : on décode. */
function render(node: React.ReactElement): string {
  return renderToStaticMarkup(node)
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}

function hint(over: Partial<HintListItem> & { id: string }): HintListItem {
  return {
    title: "Sujet",
    year: "2024-2025",
    type: "AUTRE",
    createdAt: "2026-03-01T09:00:00.000Z",
    driveUrl: "https://drive.example/hint",
    subjectName: null,
    canDelete: false,
    ...over,
  };
}

const LIBRARY: HintListItem[] = [
  hint({
    id: "h1",
    title: "Examen Final Algorithmique",
    subjectName: "Informatique",
    type: "EXAMEN",
    year: "2023-2024",
  }),
  hint({
    id: "h2",
    title: "TP Physique — Ondes",
    subjectName: "Physique",
    type: "TP",
    year: "2024-2025",
  }),
];

describe("HintsLibrary — états", () => {
  it("bibliothèque vide : état « aucun hint » (jamais présenté comme un échec de recherche)", () => {
    const html = render(<HintsLibrary hints={[]} />);
    expect(html).toContain("Aucun Hint disponible");
    expect(html).toContain("Aucune annale d'examen ou devoir corrigé n'a encore été publié pour votre classe.");
    expect(html).not.toContain("Aucun résultat");
    // Pas de barre de recherche sans rien à chercher.
    expect(html).not.toContain("Rechercher un sujet");
  });

  it("résultats disponibles : sujets affichés avec recherche, tri et compteur total", () => {
    const html = render(<HintsLibrary hints={LIBRARY} />);
    expect(html).toContain("Examen Final Algorithmique");
    expect(html).toContain("TP Physique — Ondes");
    expect(html).toContain("Rechercher un sujet");
    expect(html).toContain("Trier les sujets");
    expect(html).toContain("2 sujet(s)");
    expect(html).not.toContain("Effacer la recherche");
  });

  it("affiche la matière et la promotion (champs searchables rendus visibles)", () => {
    const html = render(<HintsLibrary hints={LIBRARY} />);
    expect(html).toContain("Informatique");
    expect(html).toContain("Physique");
    expect(html).toContain("Promotion 2023-2024");
    expect(html).toContain("Promotion 2024-2025");
  });

  it("affiche le type de ressource (badge existant conservé)", () => {
    const html = render(<HintsLibrary hints={LIBRARY} />);
    expect(html).toContain("EXAMEN");
    expect(html).toContain("TP");
  });

  it("aucun résultat : message distinct + action d'effacement de la recherche", () => {
    const html = render(<HintsLibrary hints={LIBRARY} initialQuery="chirurgie" />);
    expect(html).toContain("Aucun résultat");
    expect(html).toContain("chirurgie");
    expect(html).toContain("Effacer la recherche");
    // Présenté comme un échec de recherche, pas comme une bibliothèque vide.
    expect(html).not.toContain("Aucune annale d'examen ou devoir corrigé n'a encore été publié pour votre classe.");
    expect(html).not.toContain("TP Physique — Ondes");
  });

  it("recherche active : compteur « X sur Y » et uniquement les sujets correspondants", () => {
    const html = render(<HintsLibrary hints={LIBRARY} initialQuery="examen" />);
    expect(html).toContain("1 sur 2 résultat(s)");
    expect(html).toContain("Examen Final Algorithmique");
    expect(html).not.toContain("TP Physique — Ondes");
  });
});

describe("HintsLibrary — barre de contrôle", () => {
  it("propose les 4 libellés de tri attendus", () => {
    const html = render(<HintsLibrary hints={LIBRARY} />);
    for (const option of HINT_SORT_OPTIONS) {
      expect(html).toContain(option.label);
    }
    expect(HINT_SORT_OPTIONS).toHaveLength(4);
  });

  it("présente le bouton d'effacement dès qu'une recherche est saisie", () => {
    const html = render(<HintsLibrary hints={LIBRARY} initialQuery="physique" />);
    expect(html).toContain("Effacer la recherche");
  });
});

describe("HintsLibrary — permissions existantes", () => {
  it("aucun droit de suppression : aucun bouton de suppression", () => {
    const html = render(<HintsLibrary hints={LIBRARY} onDelete={async () => ({ success: true })} />);
    expect(html).toContain("Consulter");
    expect(html).not.toContain("Supprimer le Hint");
  });

  it("droit de suppression par ressource : bouton présent uniquement sur les hints concernés", () => {
    const items: HintListItem[] = [
      hint({ id: "h1", title: "Sujet de l'étudiant", canDelete: false }),
      hint({ id: "h2", title: "Sujet supprimable", canDelete: true }),
    ];
    const html = render(<HintsLibrary hints={items} onDelete={async () => ({ success: true })} />);
    expect(html.match(/aria-label="Supprimer le Hint"/g)).toHaveLength(1);
    expect(html).toContain("Sujet supprimable");
  });

  it("canDelete sans action de suppression : aucun bouton (pas de bouton mort)", () => {
    const html = render(<HintsLibrary hints={[hint({ id: "h1", canDelete: true })]} />);
    expect(html).not.toContain("Supprimer le Hint");
  });
});
