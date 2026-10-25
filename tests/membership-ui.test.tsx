import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";

// ---------------------------------------------------------------------------
// Tests — Paramètres → Ma classe (interface). Rendu SSR des états et des
// dialogues : aucune interaction possible ici (node env, sans DOM), on
// vérifie donc le contenu affiché, les boutons proposés pour CHAQUE état et
// les textes de confirmation. Le comportement des dialogues (focus, Échap,
// double soumission) est couvert par le composant lui-même, repris de
// ConfirmDeleteButton (tests/confirm-delete.test.ts).
// ---------------------------------------------------------------------------

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}));

vi.mock("@/actions/membership", () => ({
  leaveClassAction: async () => ({ success: true }),
  requestClassTransferAction: async () => ({ success: true }),
  cancelClassRequestAction: async () => ({ success: true }),
}));

import {
  ClassSummaryCard,
  JoinClassCard,
  LastRequestNotice,
  LeaveClassDialog,
  MyClassSection,
  PendingRequestCard,
  StatusAlert,
  TransferClassDialog,
} from "@/components/settings/MyClassSection";
import { resolveMembershipView, type MembershipInput, type MembershipRequestSnapshot } from "@/lib/business/membership";

const CLASS_A = "11111111-1111-1111-1111-111111111111";
const CLASS_B = "22222222-2222-2222-2222-222222222222";

const CLASSES = [
  { id: CLASS_A, name: "L1 Informatique", level: "Licence 1", academicYear: "2026-2027" },
  { id: CLASS_B, name: "L2 Informatique", level: "Licence 2", academicYear: "2026-2027" },
];

/** Les apostrophes sont encodées en HTML dans le rendu : on les décode. */
function render(node: React.ReactElement): string {
  return renderToStaticMarkup(node)
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}

function input(overrides: Partial<MembershipInput> = {}): MembershipInput {
  return {
    role: "STUDENT",
    classId: CLASS_A,
    className: "L1 Informatique",
    classLevel: "Licence 1",
    academicYear: "2026-2027",
    memberSince: "2026-09-01T10:00:00.000Z",
    requests: [],
    classes: CLASSES,
    ...overrides,
  };
}

function request(overrides: Partial<MembershipRequestSnapshot> = {}): MembershipRequestSnapshot {
  return {
    id: "r-1",
    classId: CLASS_B,
    previousClassId: null,
    status: "PENDING",
    createdAt: "2026-09-01T10:00:00.000Z",
    decidedAt: null,
    className: "L2 Informatique",
    previousClassName: null,
    ...overrides,
  };
}

beforeEach(() => {
  // Aucun état partagé entre les rendus (composants non montés, rendu statique).
});

describe("MyClassSection — état A : l'utilisateur appartient à une classe", () => {
  it("affiche la classe, le niveau, l'année et la date d'arrivée", () => {
    const html = render(<MyClassSection view={resolveMembershipView(input())} />);
    expect(html).toContain("L1 Informatique");
    expect(html).toContain("Licence 1 — 2026-2027");
    expect(html).toContain("Membre depuis le");
    expect(html).toContain("Étudiant");
  });

  it("propose les deux actions réellement autorisées (aucune demande en attente)", () => {
    const html = render(<MyClassSection view={resolveMembershipView(input())} />);
    expect(html).toContain("Quitter la classe");
    expect(html).toContain("Changer de classe");
    expect(html).not.toContain("Annuler ma demande");
  });

  it("n'affiche aucun formulaire de demande (une classe est déjà détenue)", () => {
    const html = render(<MyClassSection view={resolveMembershipView(input())} />);
    expect(html).not.toContain("Demander à rejoindre");
    expect(html).not.toContain("join-class-select");
  });
});

describe("MyClassSection — état A : délégué bloqué", () => {
  it("explique que la révocation du rôle doit précéder le départ", () => {
    const view = resolveMembershipView(input({ role: "DELEGATE" }));
    const html = render(<MyClassSection view={view} />);
    expect(html).toContain("Gestion des Délégués");
    expect(html).not.toContain("Quitter la classe");
    expect(html).not.toContain("Changer de classe");
  });

  it("un administrateur n'a aucune action de rattachement ici", () => {
    const html = render(<MyClassSection view={resolveMembershipView(input({ role: "ADMIN" }))} />);
    expect(html).toContain("Compte administrateur");
    expect(html).not.toContain("Quitter la classe");
  });
});

describe("MyClassSection — demande en attente", () => {
  it("demande de CHANGEMENT : classe conservée + accès de la classe visée non accordés", () => {
    const view = resolveMembershipView(
      input({ requests: [request({ previousClassId: CLASS_A, previousClassName: "L1 Informatique" })] })
    );
    const html = render(<MyClassSection view={view} />);
    expect(html).toContain("Changement de classe en attente");
    expect(html).toContain("L2 Informatique");
    expect(html).toContain("depuis");
    expect(html).toContain("L1 Informatique");
    expect(html).toContain("aucun accès à la classe demandée");
    expect(html).toContain("Annuler ma demande");
    // Actions indisponibles pendant l'attente.
    expect(html).not.toContain("Quitter la classe");
    expect(html).not.toContain("Changer de classe");
  });

  it("demande de REJOINDRE en attente (sans classe)", () => {
    const view = resolveMembershipView(
      input({
        classId: null,
        className: null,
        classLevel: null,
        academicYear: null,
        memberSince: null,
        requests: [request()],
      })
    );
    const html = render(<MyClassSection view={view} />);
    expect(html).toContain("Demande de rejoindre en attente");
    expect(html).toContain("En attente de validation");
    expect(html).not.toContain("join-class-select");
  });
});

describe("MyClassSection — état C : l'utilisateur n'appartient à aucune classe", () => {
  const noClass = (overrides: Partial<MembershipInput> = {}) =>
    resolveMembershipView(
      input({ classId: null, className: null, classLevel: null, academicYear: null, memberSince: null, ...overrides })
    );

  it("propose les classes réelles à rejoindre (pas de catalogue codé en dur)", () => {
    const html = render(<MyClassSection view={noClass()} />);
    expect(html).toContain("Vous n'appartenez à aucune classe");
    expect(html).toContain("join-class-select");
    expect(html).toContain("L1 Informatique");
    expect(html).toContain("L2 Informatique");
    expect(html).toContain("Demander à rejoindre cette classe");
    expect(html).not.toContain("Quitter la classe");
  });

  it("après une demande rejetée, affiche le dernier statut et la possibilité de recommencer", () => {
    const html = render(
      <MyClassSection
        view={noClass({
          requests: [request({ status: "REJECTED", decidedAt: "2026-09-03T10:00:00.000Z" })],
        })}
      />
    );
    expect(html).toContain("refusée");
    expect(html).toContain("Vous pouvez en soumettre une nouvelle");
    expect(html).toContain("Demander à rejoindre cette classe");
  });

  it("si aucune classe n'est disponible, l'absence est expliquée", () => {
    const html = render(<JoinClassCard classes={[]} value="" onChangeValue={() => {}} onSubmit={() => {}} />);
    expect(html).toContain("Aucune classe disponible");
    expect(html).not.toContain("join-class-select");
  });
});

describe("LeaveClassDialog — confirmation du départ", () => {
  it("explique la perte d'accès, la conservation des données et propose les deux boutons", () => {
    const html = render(
      <LeaveClassDialog className="L1 Informatique" onCancel={() => {}} onConfirm={() => {}} />
    );
    expect(html).toContain("Quitter la classe ?");
    expect(html).toContain("Vous perdrez l'accès aux données privées");
    expect(html).toContain("ne sont pas supprimées");
    expect(html).toContain("L1 Informatique");
    expect(html).toContain("Annuler");
    expect(html).toContain("Confirmer mon départ");
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
  });

  it("désactive les contrôles pendant le traitement", () => {
    const html = render(
      <LeaveClassDialog className="L1 Informatique" pending onCancel={() => {}} onConfirm={() => {}} />
    );
    expect(html).toContain('disabled=""');
  });

  it("affiche l'erreur renvoyée par le serveur", () => {
    const html = render(
      <LeaveClassDialog
        className="L1 Informatique"
        error="Vous êtes délégué de cette classe"
        onCancel={() => {}}
        onConfirm={() => {}}
      />
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain("Vous êtes délégué de cette classe");
    expect(html).not.toContain('disabled=""');
  });
});

describe("TransferClassDialog — confirmation de la demande", () => {
  it("précise qu'il s'agit d'une demande et non d'une approbation immédiate", () => {
    const html = render(
      <TransferClassDialog
        classes={[CLASSES[1]!]}
        currentClassName="L1 Informatique"
        value=""
        onChangeValue={() => {}}
        onCancel={() => {}}
        onConfirm={() => {}}
      />
    );
    expect(html).toContain("Demander à changer de classe");
    expect(html).toContain("pas une approbation immédiate");
    expect(html).toContain("conservez votre classe actuelle");
    expect(html).toContain("Sélectionner une classe");
    expect(html).toContain("L2 Informatique");
    expect(html).toContain("L1 Informatique");
    expect(html).toContain("Envoyer ma demande");
    expect(html).toContain("Annuler");
  });
});

describe("PendingRequestCard / StatusAlert / LastRequestNotice", () => {
  it("carte de demande : statut, classe visée, annulation", () => {
    const html = render(
      <PendingRequestCard request={request({ previousClassId: CLASS_A, previousClassName: "L1 Informatique" })} onCancelRequest={() => {}} />
    );
    expect(html).toContain("Changement de classe en attente");
    expect(html).toContain("L2 Informatique");
    expect(html).toContain("L1 Informatique");
    expect(html).toContain("Demandée le");
    expect(html).toContain("Annuler ma demande");
  });

  it("message de succès avec rôle de statut", () => {
    const html = render(<StatusAlert tone="success" message="Vous avez quitté la classe." />);
    expect(html).toContain('role="status"');
    expect(html).toContain("Vous avez quitté la classe.");
  });

  it("message d'erreur avec rôle d'alerte et bouton de fermeture", () => {
    const html = render(
      <StatusAlert tone="error" message="L'opération a échoué." onDismiss={() => {}} />
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain("L'opération a échoué.");
    expect(html).toContain("Fermer le message");
  });

  it("une dernière décision ACCEPTÉE n'affiche pas d'avertissement", () => {
    const html = render(
      <LastRequestNotice
        lastDecision={{
          status: "ACCEPTED",
          className: "L1 Informatique",
          previousClassName: null,
          decidedAt: "2026-09-03T10:00:00.000Z",
          isChange: false,
        }}
      />
    );
    expect(html).toBe("");
  });

  it("une dernière demande CANCELLED invite à en soumettre une nouvelle", () => {
    const html = render(
      <LastRequestNotice
        lastDecision={{
          status: "CANCELLED",
          className: "L2 Informatique",
          previousClassName: null,
          decidedAt: "2026-09-03T10:00:00.000Z",
          isChange: false,
        }}
      />
    );
    expect(html).toContain("annulée");
    expect(html).toContain("Vous pouvez en soumettre une nouvelle");
  });
});

describe("ClassSummaryCard — actions par état", () => {
  it("étudiant sans demande : les deux actions sont présentes", () => {
    const html = render(
      <ClassSummaryCard
        view={resolveMembershipView(input())}
        onLeave={() => {}}
        onChangeClass={() => {}}
      />
    );
    expect(html).toContain("Quitter la classe");
    expect(html).toContain("Changer de classe");
  });

  it("demande en attente : actions masquées, note explicative affichée", () => {
    const html = render(
      <ClassSummaryCard
        view={resolveMembershipView(
          input({ requests: [request({ previousClassId: CLASS_A, previousClassName: "L1 Informatique" })] })
        )}
        onLeave={() => {}}
        onChangeClass={() => {}}
      />
    );
    expect(html).not.toContain("Quitter la classe");
    expect(html).not.toContain("Changer de classe");
    expect(html).toContain("en attente");
  });
});
