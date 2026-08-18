import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";

// ---------------------------------------------------------------------------
// Tests U3 — Confirmation avant suppression destructive (classe, document,
//  hint, recording). Deux niveaux :
//   1. Rendu SSR du dialogue de confirmation (message, nom, boutons,
//      affichage de l'erreur, loading) — accessible, sans DOM (node env).
//   2. Les Server Actions des types non couverts par resources-delete.test.ts
//      (classe, recording) renvoient bien { success } / { error }.
// ---------------------------------------------------------------------------

const state = vi.hoisted(() => ({
  deleteError: null as string | null,
  deleteCalled: null as string | null,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    from: (table: string) => ({
      delete: () => ({
        eq: async () => {
          state.deleteCalled = table;
          return { error: state.deleteError ? { message: state.deleteError } : null };
        },
      }),
    }),
  }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: () => {},
}));

import { deleteClassAction } from "@/actions/classes";
import { deleteRecordingAction } from "@/actions/recordings";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteButton";

const setup = ({ deleteError = null as string | null } = {}) => {
  state.deleteError = deleteError;
  state.deleteCalled = null;
};

beforeEach(() => setup());

describe("deleteClassAction — confirmation serveur (type : classe)", () => {
  it("suppression réussie : { success: true }", async () => {
    const res = await deleteClassAction("c-1");
    expect(res).toEqual({ success: true });
    expect(state.deleteCalled).toBe("classes");
  });

  it("échec RLS / contrainte : erreur explicite, aucun succès", async () => {
    setup({ deleteError: "classes with existing members cannot be deleted" });
    const res = await deleteClassAction("c-1");
    expect(res).toEqual({
      error: "Impossible de supprimer : classes with existing members cannot be deleted",
    });
  });
});

describe("deleteRecordingAction — confirmation serveur (type : recording)", () => {
  it("suppression réussie : { success: true }", async () => {
    const res = await deleteRecordingAction("r-1");
    expect(res).toEqual({ success: true });
    expect(state.deleteCalled).toBe("recordings");
  });

  it("échec RLS : erreur explicite, aucun succès", async () => {
    setup({ deleteError: "new row violates row-level security policy" });
    const res = await deleteRecordingAction("r-1");
    expect(res).toEqual({ error: "new row violates row-level security policy" });
  });
});

describe("ConfirmDeleteDialog — contenu du dialogue de confirmation", () => {
  const render = (props: Partial<React.ComponentProps<typeof ConfirmDeleteDialog>> = {}) =>
    renderToStaticMarkup(
      React.createElement(ConfirmDeleteDialog, {
        resourceLabel: "ce document",
        resourceName: "Poly Chapitre 3 — TCP/IP",
        onCancel: () => {},
        onConfirm: () => {},
        ...props,
      })
    );

  it("affiche la question, l'avertissement irréversible et le nom de la ressource", () => {
    const html = render();
    expect(html).toContain("Supprimer ce document ?");
    expect(html).toContain("Êtes-vous sûr de vouloir supprimer cette ressource ? Cette action est irréversible.");
    expect(html).toContain("« Poly Chapitre 3 — TCP/IP »");
  });

  it("expose un dialogue modal accessible (role/aria)", () => {
    const html = render();
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-labelledby="confirm-delete-title"');
    expect(html).toContain('aria-describedby="confirm-delete-desc"');
  });

  it("propose les boutons Annuler et Supprimer", () => {
    const html = render();
    expect(html).toContain("Annuler");
    expect(html).toContain("Supprimer");
  });

  it("affiche l'erreur serveur si la suppression échoue", () => {
    const html = render({ error: "Vous n'êtes pas autorisé à supprimer ce document" });
    expect(html).toContain('role="alert"');
    expect(html).toContain("pas autorisé à supprimer ce document");
  });

  it("bloque les actions pendant le chargement (annuler désactivé, bouton en cours)", () => {
    const html = render({ pending: true });
    expect(html).toContain('disabled=""');
    expect(html).toContain("lucide-loader-circle");
  });

  it("n'affiche aucune erreur quand la suppression réussit", () => {
    const html = render({ error: null });
    expect(html).not.toContain('role="alert"');
  });

  it("reflète le nom exact de la ressource passée (ex: hint, enregistrement)", () => {
    const html = render({ resourceLabel: "cet enregistrement", resourceName: "Cours OS — Séance 3" });
    expect(html).toContain("Supprimer cet enregistrement ?");
    expect(html).toContain("« Cours OS — Séance 3 »");
  });
});
