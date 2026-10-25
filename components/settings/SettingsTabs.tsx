"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Lock, School, User } from "lucide-react";

/* ──────────────────────────────────────────────────────────────────
   Navigation interne du module Profil & Paramètres.
   Organisation claire en 4 sections :
     1. Mon profil       → identité, infos académiques, prénom/nom
     2. Compte & Sécurité → mot de passe, session, sécurité
     3. Notifications    → préférences par catégorie
     4. Ma classe        → statut d'appartenance, changement de classe
   ────────────────────────────────────────────────────────────────── */

export const SETTINGS_TABS = [
  { href: "/dashboard/settings/profile", label: "Mon profil", icon: User },
  { href: "/dashboard/settings/account", label: "Compte & Sécurité", icon: Lock },
  { href: "/dashboard/settings/notifications", label: "Notifications", icon: Bell },
  { href: "/dashboard/settings/class", label: "Ma classe", icon: School },
] as const;

export function SettingsTabs() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Sections des paramètres"
      className="flex items-center gap-1.5 overflow-x-auto no-scrollbar rounded-2xl border border-border/70 bg-card/70 p-1.5 shadow-sm"
    >
      {SETTINGS_TABS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-xl px-3.5 py-2 text-xs sm:text-sm font-semibold transition-all duration-150 ${
              active
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"
            }`}
          >
            <Icon size={15} strokeWidth={active ? 2.5 : 1.75} />
            <span className="whitespace-nowrap">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
