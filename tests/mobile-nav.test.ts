import { describe, it, expect } from "vitest";
import {
  MOBILE_PRIMARY_NAV,
  getMobileMoreItems,
  isNavItemActive,
  isMoreActive,
} from "@/lib/navigation/mobile-nav";

// ---------------------------------------------------------------------------
// Tests navigation mobile — bottom navigation (5 emplacements) + menu « Plus ».
//  La configuration est extraite dans lib/navigation/mobile-nav.ts afin de
//  tester les permissions et la détection d'état actif sans DOM (env node).
// ---------------------------------------------------------------------------

describe("Bottom navigation — emplacements principaux", () => {
  it("expose les 4 destinations principales dans l'ordre attendu (le 5ᵉ emplacement est « Plus »)", () => {
    expect(MOBILE_PRIMARY_NAV.map((item) => item.href)).toEqual([
      "/dashboard",
      "/dashboard/tasks",
      "/dashboard/documents",
      "/dashboard/chat",
    ]);
    // Le 5ᵉ emplacement (Plus) est géré par le composant, pas par la config
    expect(MOBILE_PRIMARY_NAV).toHaveLength(4);
  });

  it("fournit un libellé complet et un libellé court non ambigu pour chaque item", () => {
    for (const item of MOBILE_PRIMARY_NAV) {
      expect(item.label.length).toBeGreaterThan(0);
      expect(item.shortLabel.length).toBeGreaterThan(0);
    }
    const tasks = MOBILE_PRIMARY_NAV.find((i) => i.href === "/dashboard/tasks")!;
    expect(tasks.label).toBe("Tâches & Devoirs");
    expect(tasks.shortLabel).toBe("Tâches");
  });

  it("réutilise les routes existantes uniquement", () => {
    for (const item of MOBILE_PRIMARY_NAV) {
      expect(item.href.startsWith("/dashboard")).toBe(true);
    }
  });
});

describe("Bottom navigation — détection de la destination active", () => {
  const home = MOBILE_PRIMARY_NAV[0]!;
  const tasks = MOBILE_PRIMARY_NAV[1]!;

  it("considère /dashboard (et ses variantes student/delegate) comme l'accueil actif", () => {
    expect(isNavItemActive("/dashboard", home)).toBe(true);
    expect(isNavItemActive("/dashboard/student", home)).toBe(true);
    expect(isNavItemActive("/dashboard/delegate", home)).toBe(true);
    expect(isNavItemActive("/dashboard/tasks", home)).toBe(false);
  });

  it("utilise le préfixe pour les routes non exactes", () => {
    expect(isNavItemActive("/dashboard/tasks", tasks)).toBe(true);
    expect(isNavItemActive("/dashboard/documents", tasks)).toBe(false);
  });
});

describe("Menu « Plus » — permissions par rôle", () => {
  it("STUDENT : schedule, evaluations, hints, recordings, notifications, paramètres — ni statistiques ni administration", () => {
    const items = getMobileMoreItems("STUDENT");
    expect(items.map((i) => i.href)).toEqual([
      "/dashboard/schedule",
      "/dashboard/evaluations",
      "/dashboard/hints",
      "/dashboard/recordings",
      "/dashboard/notifications",
      "/dashboard/settings",
    ]);
    expect(items.some((i) => i.href === "/dashboard/stats")).toBe(false);
    expect(items.some((i) => i.href === "/dashboard/admin")).toBe(false);
  });

  it("les paramètres sont accessibles à TOUS les rôles (profil et préférences personnelles)", () => {
    for (const role of ["STUDENT", "DELEGATE", "ADMIN"] as const) {
      expect(getMobileMoreItems(role).map((i) => i.href)).toContain(
        "/dashboard/settings"
      );
    }
  });

  it("les évaluations sont accessibles à TOUS les rôles (module lecture pour les étudiants)", () => {
    for (const role of ["STUDENT", "DELEGATE", "ADMIN"] as const) {
      expect(getMobileMoreItems(role).map((i) => i.href)).toContain("/dashboard/evaluations");
    }
  });

  it("DELEGATE : accède aux statistiques, pas à l'administration", () => {
    const items = getMobileMoreItems("DELEGATE");
    const hrefs = items.map((i) => i.href);
    expect(hrefs).toContain("/dashboard/stats");
    expect(hrefs).not.toContain("/dashboard/admin");
  });

  it("ADMIN : statistiques + administration traitée en danger", () => {
    const items = getMobileMoreItems("ADMIN");
    const admin = items.find((i) => i.href === "/dashboard/admin");
    expect(items.map((i) => i.href)).toContain("/dashboard/stats");
    expect(admin).toBeDefined();
    expect(admin!.danger).toBe(true);
  });

  it("seul l'élément Administration porte le traitement danger", () => {
    for (const role of ["STUDENT", "DELEGATE", "ADMIN"] as const) {
      for (const item of getMobileMoreItems(role)) {
        if (item.href === "/dashboard/admin") {
          expect(item.danger).toBe(true);
        } else {
          expect(item.danger).toBeUndefined();
        }
      }
    }
  });
});

describe("Menu « Plus » — activation de l'onglet Plus", () => {
  it("active Plus quand une destination du menu est courante", () => {
    expect(isMoreActive("/dashboard/hints", "STUDENT")).toBe(true);
    expect(isMoreActive("/dashboard/notifications", "STUDENT")).toBe(true);
    expect(isMoreActive("/dashboard/recordings", "STUDENT")).toBe(true);
    expect(isMoreActive("/dashboard/stats", "DELEGATE")).toBe(true);
    expect(isMoreActive("/dashboard/admin", "ADMIN")).toBe(true);
  });

  it("reste inactif sur les destinations de la barre principale", () => {
    expect(isMoreActive("/dashboard", "ADMIN")).toBe(false);
    expect(isMoreActive("/dashboard/tasks", "ADMIN")).toBe(false);
    expect(isMoreActive("/dashboard/documents", "ADMIN")).toBe(false);
    expect(isMoreActive("/dashboard/chat", "ADMIN")).toBe(false);
  });

  it("n'active jamais Plus pour une route à laquelle le rôle n'a pas droit", () => {
    expect(isMoreActive("/dashboard/stats", "STUDENT")).toBe(false);
    expect(isMoreActive("/dashboard/admin", "STUDENT")).toBe(false);
    expect(isMoreActive("/dashboard/admin", "DELEGATE")).toBe(false);
  });
});
