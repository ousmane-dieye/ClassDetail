import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";

// ---------------------------------------------------------------------------
// Tests interface — bibliothèque « Cours enregistrés ». Rendu SSR des états :
//  node env sans DOM, on vérifie donc le contenu affiché, la présence de la
//  barre de recherche et du sélecteur de tri (4 libellés), les compteurs, et
//  la conservation des permissions (bouton de suppression réservé aux
//  gestionnaires). Les tests de logique (recherche, accents, 4 tris,
//  combinaison, égalités) sont dans tests/recordings-listing.test.ts.
// ---------------------------------------------------------------------------

import { RecordingsLibrary } from "@/components/recordings/RecordingsLibrary";
import { RECORDING_SORT_OPTIONS, type RecordingListItem } from "@/lib/recordings/listing";

/** Les apostrophes/quotes sont encodées en HTML dans le rendu : on décode. */
function render(node: React.ReactElement): string {
  return renderToStaticMarkup(node)
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}

function rec(over: Partial<RecordingListItem> & { id: string }): RecordingListItem {
  return {
    title: "Cours",
    description: null,
    date: "2026-03-01",
    createdAt: "2026-03-01T09:00:00.000Z",
    driveUrl: "https://drive.example/vid",
    subjectName: null,
    ...over,
  };
}

const LIBRARY: RecordingListItem[] = [
  rec({
    id: "r1",
    title: "Algorithmique avancée",
    subjectName: "Informatique",
    description: "Récursivité et complexité",
    date: "2026-05-12",
  }),
  rec({
    id: "r2",
    title: "Optique ondulatoire",
    subjectName: "Physique",
    description: "Interférences et diffraction",
    date: "2026-05-20",
  }),
];

describe("RecordingsLibrary — états", () => {
  it("bibliothèque vide : état « aucun cours » (jamais présenté comme un échec de recherche)", () => {
    const html = render(<RecordingsLibrary recordings={[]} canManage={false} />);
    expect(html).toContain("Aucun cours enregistré");
    expect(html).toContain("Les séances de cours enregistrées n'ont pas encore été mises en ligne.");
    expect(html).not.toContain("Aucun résultat");
    // Pas de barre de recherche sans rien à chercher.
    expect(html).not.toContain("Rechercher un cours enregistré");
  });

  it("résultats disponibles : cours affichés avec recherche, tri et compteur total", () => {
    const html = render(<RecordingsLibrary recordings={LIBRARY} canManage={false} />);
    expect(html).toContain("Algorithmique avancée");
    expect(html).toContain("Optique ondulatoire");
    expect(html).toContain("Récursivité et complexité");
    expect(html).toContain("Rechercher un cours enregistré");
    expect(html).toContain("Trier les cours enregistrés");
    expect(html).toContain("2 enregistrement(s)");
    expect(html).not.toContain("Effacer la recherche");
  });

  it("affiche la matière associée (champ searchable rendu visible)", () => {
    const html = render(<RecordingsLibrary recordings={LIBRARY} canManage={false} />);
    expect(html).toContain("Informatique");
    expect(html).toContain("Physique");
  });

  it("aucun résultat : message distinct + action d'effacement de la recherche", () => {
    const html = render(
      <RecordingsLibrary recordings={LIBRARY} canManage={false} initialQuery="chirurgie" />
    );
    expect(html).toContain("Aucun résultat");
    expect(html).toContain("chirurgie");
    expect(html).toContain("Effacer la recherche");
    // Présenté comme un échec de recherche, pas comme une bibliothèque vide.
    expect(html).not.toContain("Les séances de cours enregistrées n'ont pas encore été mises en ligne.");
    expect(html).not.toContain("Optique ondulatoire");
  });

  it("recherche active : compteur « X sur Y » et uniquement les cours correspondants", () => {
    const html = render(
      <RecordingsLibrary recordings={LIBRARY} canManage={false} initialQuery="optique" />
    );
    expect(html).toContain("1 sur 2 résultat(s)");
    expect(html).toContain("Optique ondulatoire");
    expect(html).not.toContain("Algorithmique avancée");
  });
});

describe("RecordingsLibrary — barre de contrôle", () => {
  it("propose les 4 libellés de tri attendus", () => {
    const html = render(<RecordingsLibrary recordings={LIBRARY} canManage={false} />);
    for (const option of RECORDING_SORT_OPTIONS) {
      expect(html).toContain(option.label);
    }
    expect(RECORDING_SORT_OPTIONS).toHaveLength(4);
  });

  it("présente le bouton d'effacement dès qu'une recherche est saisie", () => {
    const html = render(
      <RecordingsLibrary recordings={LIBRARY} canManage={false} initialQuery="physique" />
    );
    expect(html).toContain("Effacer la recherche");
  });
});

describe("RecordingsLibrary — permissions existantes", () => {
  it("étudiant (canManage=false) : aucun bouton de suppression", () => {
    const html = render(<RecordingsLibrary recordings={LIBRARY} canManage={false} />);
    expect(html).toContain("Visionner");
    expect(html).not.toContain("Supprimer la vidéo");
  });

  it("délégué/admin (canManage=true) : suppression accessible sur chaque carte", () => {
    const html = render(
      <RecordingsLibrary
        recordings={LIBRARY}
        canManage={true}
        onDelete={async () => ({ success: true })}
      />
    );
    expect(html).toContain("Visionner");
    expect(html.match(/aria-label="Supprimer la vidéo"/g)).toHaveLength(2);
  });
});
