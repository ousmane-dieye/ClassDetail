import type { UserRole } from "@/types/database.types";

/* ──────────────────────────────────────────────────────────────────
   Navigation mobile (bottom navigation) — configuration partagée.

   Les 4 premiers emplacements pointent vers les destinations
   principales ; le 5ᵉ emplacement « Plus » est un bouton ouvrant un
   bottom sheet dont le contenu est défini par getMobileMoreItems().

   Les routes et la logique d'état actif sont les mêmes que celles de
   la sidebar desktop (aucune route ni logique parallèle).
   ────────────────────────────────────────────────────────────────── */

export interface MobileNavItem {
  href: string;
  label: string;
  /** Libellé raccourci affiché sous l'icône dans la barre (5 colonnes). */
  shortLabel: string;
  exact?: boolean;
}

/** Emplacements 1 à 4 de la bottom navigation (le 5ᵉ est « Plus »). */
export const MOBILE_PRIMARY_NAV: MobileNavItem[] = [
  { href: "/dashboard", label: "Accueil", shortLabel: "Accueil", exact: true },
  { href: "/dashboard/tasks", label: "Tâches & Devoirs", shortLabel: "Tâches" },
  { href: "/dashboard/documents", label: "Documents", shortLabel: "Documents" },
  { href: "/dashboard/chat", label: "Chat de classe", shortLabel: "Chat" },
];

export interface MobileMoreItem {
  href: string;
  label: string;
  /** Traitement visuel rouge/danger (Administration). */
  danger?: boolean;
}

/**
 * Contenu du bottom sheet « Plus », filtré strictement selon le rôle —
 * mêmes conditions que la sidebar desktop :
 *  - STUDENT  : aucun accès statistiques ni administration ;
 *  - DELEGATE : + Statistiques ;
 *  - ADMIN    : + Statistiques et Administration (danger).
 */
export function getMobileMoreItems(role: UserRole): MobileMoreItem[] {
  const items: MobileMoreItem[] = [
    { href: "/dashboard/hints", label: "Hints & Sujets" },
    { href: "/dashboard/recordings", label: "Cours enregistrés" },
    { href: "/dashboard/notifications", label: "Notifications" },
  ];

  if (role !== "STUDENT") {
    items.push({ href: "/dashboard/stats", label: "Statistiques" });
  }

  if (role === "ADMIN") {
    items.push({ href: "/dashboard/admin", label: "Administration", danger: true });
  }

  return items;
}

/**
 * Détection de la destination active — logique identique à la sidebar
 * desktop : les items « exact » couvrent également /dashboard/student et
 * /dashboard/delegate (deux variantes du tableau de bord).
 */
export function isNavItemActive(
  pathname: string,
  item: { href: string; exact?: boolean }
): boolean {
  if (item.exact) {
    return (
      pathname === item.href ||
      pathname === "/dashboard/student" ||
      pathname === "/dashboard/delegate"
    );
  }
  return pathname.startsWith(item.href);
}

/** Vrai si une destination du menu « Plus » est active → l'onglet Plus s'active aussi. */
export function isMoreActive(pathname: string, role: UserRole): boolean {
  return getMobileMoreItems(role).some((item) => isNavItemActive(pathname, item));
}
