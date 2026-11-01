import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";

// ---------------------------------------------------------------------------
// Tests interface — bibliothèque « Documents ». Rendu SSR des états :
//  node env sans DOM, on vérifie donc le contenu affiché, la présence de la
//  barre de recherche et du sélecteur de tri (4 libellés), les compteurs, la
//  recherche active appliquée au rendu, et la conservation des permissions
//  (suppression réservée aux ressources où `canDelete` est true, précalculé
//  côté serveur). Les tests de logique (recherche, accents, tris,
//  combinaison) sont dans tests/documents-listing.test.ts.
// ---------------------------------------------------------------------------

import { DocumentsLibrary } from "@/components/documents/DocumentsLibrary";
import { DOCUMENT_SORT_OPTIONS, type DocumentListItem } from "@/lib/documents/listing";

/** Les apostrophes/quotes sont encodées en HTML dans le rendu : on décode. */
function render(node: React.ReactElement): string {
  return renderToStaticMarkup(node)
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}

function doc(over: Partial<DocumentListItem> & { id: string }): DocumentListItem {
  return {
    title: "Document",
    description: null,
    createdAt: "2026-03-01T09:00:00.000Z",
    driveUrl: "https://drive.example/doc",
    subjectName: null,
    canDelete: false,
    ...over,
  };
}

const LIBRARY: DocumentListItem[] = [
  doc({
    id: "d1",
    title: "Polycopié Algorithmique",
    subjectName: "Informatique",
    description: "Récursivité et complexité",
    createdAt: "2026-05-12T10:00:00.000Z",
  }),
  doc({
    id: "d2",
    title: "Optique ondulatoire",
    subjectName: "Physique",
    description: "Interférences et diffraction",
    createdAt: "2026-05-20T08:00:00.000Z",
  }),
];

describe("DocumentsLibrary — états", () => {
  it("bibliothèque vide : état « aucun document » (jamais présenté comme un échec de recherche)", () => {
    const html = render(<DocumentsLibrary documents={[]} />);
    expect(html).toContain("Aucun document pour le moment");
    expect(html).toContain("La bibliothèque est vide. Soyez le premier à partager un support de cours avec votre promotion !");
    expect(html).not.toContain("Aucun résultat");
    // Pas de barre de recherche sans rien à chercher.
    expect(html).not.toContain("Rechercher un document");
  });

  it("résultats disponibles : documents affichés avec recherche, tri et compteur total", () => {
    const html = render(<DocumentsLibrary documents={LIBRARY} />);
    expect(html).toContain("Polycopié Algorithmique");
    expect(html).toContain("Optique ondulatoire");
    expect(html).toContain("Récursivité et complexité");
    expect(html).toContain("Rechercher un document");
    expect(html).toContain("Trier les documents");
    expect(html).toContain("2 document(s)");
    expect(html).not.toContain("Effacer la recherche");
  });

  it("affiche la matière associée (champ searchable rendu visible)", () => {
    const html = render(<DocumentsLibrary documents={LIBRARY} />);
    expect(html).toContain("Informatique");
    expect(html).toContain("Physique");
  });

  it("aucun résultat : message distinct + action d'effacement de la recherche", () => {
    const html = render(<DocumentsLibrary documents={LIBRARY} initialQuery="chirurgie" />);
    expect(html).toContain("Aucun résultat");
    expect(html).toContain("chirurgie");
    expect(html).toContain("Effacer la recherche");
    // Présenté comme un échec de recherche, pas comme une bibliothèque vide.
    expect(html).not.toContain("La bibliothèque est vide. Soyez le premier à partager un support de cours avec votre promotion !");
    expect(html).not.toContain("Optique ondulatoire");
  });

  it("recherche active : compteur « X sur Y » et uniquement les documents correspondants", () => {
    const html = render(<DocumentsLibrary documents={LIBRARY} initialQuery="optique" />);
    expect(html).toContain("1 sur 2 résultat(s)");
    expect(html).toContain("Optique ondulatoire");
    expect(html).not.toContain("Polycopié Algorithmique");
  });
});

describe("DocumentsLibrary — barre de contrôle", () => {
  it("propose les 4 libellés de tri attendus", () => {
    const html = render(<DocumentsLibrary documents={LIBRARY} />);
    for (const option of DOCUMENT_SORT_OPTIONS) {
      expect(html).toContain(option.label);
    }
    expect(DOCUMENT_SORT_OPTIONS).toHaveLength(4);
  });

  it("présente le bouton d'effacement dès qu'une recherche est saisie", () => {
    const html = render(<DocumentsLibrary documents={LIBRARY} initialQuery="physique" />);
    expect(html).toContain("Effacer la recherche");
  });
});

describe("DocumentsLibrary — permissions existantes", () => {
  it("aucun droit de suppression : aucun bouton de suppression", () => {
    const html = render(<DocumentsLibrary documents={LIBRARY} onDelete={async () => ({ success: true })} />);
    expect(html).toContain("Ouvrir");
    expect(html).not.toContain("Supprimer le document");
  });

  it("droit de suppression par ressource : bouton présent uniquement sur les documents concernés", () => {
    const items: DocumentListItem[] = [
      doc({ id: "d1", title: "Document de l'étudiant", canDelete: false }),
      doc({ id: "d2", title: "Document supprimable", canDelete: true }),
    ];
    const html = render(<DocumentsLibrary documents={items} onDelete={async () => ({ success: true })} />);
    expect(html.match(/aria-label="Supprimer le document"/g)).toHaveLength(1);
    expect(html).toContain("Document supprimable");
  });

  it("canDelete sans action de suppression : aucun bouton (pas de bouton mort)", () => {
    const html = render(<DocumentsLibrary documents={[doc({ id: "d1", canDelete: true })]} />);
    expect(html).not.toContain("Supprimer le document");
  });
});
