"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  LayoutDashboard,
  CalendarDays,
  CheckSquare,
  ClipboardCheck,
  FileText,
  MessageSquare,
  MoreHorizontal,
  Lightbulb,
  Video,
  Bell,
  BarChart3,
  Shield,
  Sparkles,
  LogOut,
  X,
  GraduationCap,
  Settings,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { logoutAction } from "@/actions/auth";
import type { UserRole } from "@/types/database.types";
import { Badge } from "@/components/ui/Badge";
import {
  MOBILE_PRIMARY_NAV,
  isNavItemActive,
  getMobileMoreItems,
  isMoreActive,
} from "@/lib/navigation/mobile-nav";
import { OPEN_ASSISTANT_EVENT } from "@/lib/constants/assistant";

/* ──────────────────────────────────────────────────────────────────
   Icônes des destinations principales (emplacements 1 à 4)
   ────────────────────────────────────────────────────────────────── */

const PRIMARY_ICONS: Record<string, LucideIcon> = {
  "/dashboard": LayoutDashboard,
  "/dashboard/tasks": CheckSquare,
  "/dashboard/documents": FileText,
  "/dashboard/chat": MessageSquare,
};

const MORE_ICONS: Record<string, LucideIcon> = {
  "/dashboard/schedule": CalendarDays,
  "/dashboard/evaluations": ClipboardCheck,
  "/dashboard/hints": Lightbulb,
  "/dashboard/recordings": Video,
  "/dashboard/notifications": Bell,
  "/dashboard/settings": Settings,
  "/dashboard/stats": BarChart3,
  "/dashboard/admin": Shield,
};

/* ──────────────────────────────────────────────────────────────────
   Bottom sheet « Plus »
   ────────────────────────────────────────────────────────────────── */

function MoreSheet({
  role,
  unreadCount,
  userName,
  onClose,
  returnFocusRef,
}: {
  role: UserRole;
  unreadCount: number;
  userName?: string;
  onClose: () => void;
  returnFocusRef: React.RefObject<HTMLButtonElement>;
}) {
  const pathname = usePathname();
  const panelRef = useRef<HTMLDivElement>(null);
  const items = getMobileMoreItems(role);

  // Touche Échap
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  // Bloque le scroll du body pendant l'ouverture
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  // Focus initial sur le panneau + retour au bouton « Plus » à la fermeture
  useEffect(() => {
    const returnFocusButton = returnFocusRef.current;
    panelRef.current?.focus({ preventScroll: true });
    return () => {
      returnFocusButton?.focus({ preventScroll: true });
    };
  }, [returnFocusRef]);

  // Piège de focus clavier (Tab circule dans le panneau)
  const handlePanelKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab" || !panelRef.current) return;
    const focusables = Array.from(
      panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    );
    if (focusables.length === 0) return;
    const first = focusables[0]!;
    const last = focusables[focusables.length - 1]!;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const initials =
    `${userName?.[0] ?? ""}${userName?.split(" ")?.[1]?.[0] ?? ""}`.toUpperCase() || "U";

  const roleBadgeVariant = role === "ADMIN" ? "danger" : role === "DELEGATE" ? "warning" : "neutral";
  const roleLabel = role === "ADMIN" ? "Administrateur" : role === "DELEGATE" ? "Délégué" : "Étudiant";

  return (
    <div className="fixed inset-0 z-50 md:hidden">
      {/* Fond cliquable */}
      <button
        aria-label="Fermer le menu"
        onClick={onClose}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in"
      />

      {/* Panneau bottom sheet */}
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Plus — modules et compte"
        onKeyDown={handlePanelKeyDown}
        className="absolute inset-x-0 bottom-0 flex max-h-[85dvh] flex-col rounded-t-3xl border-t border-border bg-card pb-[env(safe-area-inset-bottom)] shadow-float animate-slide-in-up focus:outline-none"
      >
        {/* En-tête */}
        <div className="flex items-center justify-between gap-3 border-b border-border/70 px-5 pb-3 pt-2.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-subtle">
              <GraduationCap size={18} strokeWidth={2} />
            </div>
            <div className="min-w-0">
              <p className="font-display text-base font-bold tracking-tight">Plus</p>
              <p className="truncate text-[11px] text-muted-foreground">Modules &amp; compte</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Fermer le menu"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-all hover:bg-muted hover:text-foreground active:scale-95"
          >
            <X size={18} />
          </button>
        </div>

        {/* Contenu défilant */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-4 pt-4">
          {/* Modules secondaires */}
          <div className="grid grid-cols-2 gap-2.5">
            {items.map((item) => {
              const Icon = MORE_ICONS[item.href] ?? Sparkles;
              const active = isNavItemActive(pathname, item);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onClose}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-w-0 items-center gap-3 rounded-2xl border p-3.5 text-left transition-all active:scale-[0.98] ${
                    item.danger
                      ? active
                        ? "border-danger/30 bg-danger/8 text-danger"
                        : "border-danger/20 bg-background/60 text-danger hover:bg-danger/8"
                      : active
                      ? "border-primary/25 bg-primary/8 text-foreground"
                      : "border-border/70 bg-background/60 text-foreground hover:bg-muted/60"
                  }`}
                >
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                      item.danger
                        ? "bg-danger/10 text-danger"
                        : active
                        ? "bg-primary/12 text-primary"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    <Icon size={18} strokeWidth={active ? 2.25 : 1.75} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold leading-tight">
                      {item.label}
                    </span>
                    {item.href === "/dashboard/notifications" && unreadCount > 0 && (
                      <span className="mt-1 inline-flex items-center rounded-full bg-danger px-1.5 py-0.5 text-[10px] font-bold text-white">
                        {unreadCount > 9 ? "9+" : unreadCount} non lue
                        {unreadCount > 1 ? "s" : ""}
                      </span>
                    )}
                  </span>
                </Link>
              );
            })}

            {/* Assistant IA — ouvre le panneau flottant existant */}
            <button
              onClick={() => {
                window.dispatchEvent(new Event(OPEN_ASSISTANT_EVENT));
                onClose();
              }}
              className="flex min-w-0 items-center gap-3 rounded-2xl border border-border/70 bg-background/60 p-3.5 text-left text-foreground transition-all hover:bg-muted/60 active:scale-[0.98]"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
                <Sparkles size={18} strokeWidth={1.75} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold leading-tight">
                  Assistant IA
                </span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  Ouvrir le panneau
                </span>
              </span>
            </button>
          </div>

          {/* Profil / rôle (informationnel — aucune route profil n'existe) */}
          <div className="mt-4 flex items-center gap-3 rounded-2xl border border-border/70 bg-muted/40 p-3.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-sm font-extrabold text-primary-foreground shadow-subtle">
              {initials}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold leading-tight">
                {userName?.trim() || "Mon profil"}
              </p>
              <p className="text-[11px] text-muted-foreground">Votre rôle</p>
            </div>
            <Badge variant={roleBadgeVariant}>{roleLabel}</Badge>
          </div>

          {/* Déconnexion — même mécanisme que la sidebar (server action) */}
          <form action={logoutAction} className="mt-2.5">
            <button
              type="submit"
              className="group flex w-full items-center gap-3 rounded-2xl border border-border/70 bg-background/60 p-3.5 text-left text-[13px] font-semibold text-muted-foreground transition-all hover:bg-danger/8 hover:text-danger active:scale-[0.98]"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-danger/10 text-danger transition-transform group-hover:-translate-x-0.5">
                <LogOut size={18} strokeWidth={1.75} />
              </span>
              <span className="flex-1">Déconnexion</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────
   Bottom navigation mobile (5 emplacements)
   ────────────────────────────────────────────────────────────────── */

export function MobileBottomNav({
  role,
  unreadCount = 0,
  userName,
}: {
  role: UserRole;
  unreadCount?: number;
  userName?: string;
}) {
  const pathname = usePathname();
  const [sheetOpen, setSheetOpen] = useState(false);
  const plusButtonRef = useRef<HTMLButtonElement>(null);

  const closeSheet = useCallback(() => setSheetOpen(false), []);
  const moreActive = isMoreActive(pathname, role);

  // Referme au changement de route (composant toujours monté → effet sans effet de bord à l'ouverture)
  useEffect(() => {
    setSheetOpen(false);
  }, [pathname]);

  // Referme le sheet au passage en desktop (rotation / redimensionnement)
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const onChange = () => {
      if (mq.matches) setSheetOpen(false);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return (
    <>
      <nav
        aria-label="Navigation principale"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
      >
        <div className="grid h-16 grid-cols-5">
          {MOBILE_PRIMARY_NAV.map((item) => {
            const Icon = PRIMARY_ICONS[item.href] ?? LayoutDashboard;
            const active = isNavItemActive(pathname, item);

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-label={item.label}
                aria-current={active ? "page" : undefined}
                title={item.label}
                className={`relative flex min-w-0 flex-col items-center justify-center gap-1 px-1 transition-colors ${
                  active ? "text-primary" : "text-muted-foreground"
                }`}
              >
                {active && (
                  <span
                    aria-hidden="true"
                    className="absolute top-0 h-0.5 w-8 rounded-full bg-primary"
                  />
                )}
                <Icon size={20} strokeWidth={active ? 2.25 : 1.75} className="shrink-0" />
                <span className="w-full truncate px-0.5 text-center text-[10px] font-semibold leading-none">
                  {item.shortLabel}
                </span>
              </Link>
            );
          })}

          {/* 5ᵉ emplacement : Plus (bottom sheet) */}
          <button
            ref={plusButtonRef}
            onClick={() => setSheetOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={sheetOpen}
            aria-label="Plus d'options de navigation"
            title="Plus"
            className={`relative flex min-w-0 flex-col items-center justify-center gap-1 px-1 transition-colors ${
              moreActive || sheetOpen ? "text-primary" : "text-muted-foreground"
            }`}
          >
            {(moreActive || sheetOpen) && (
              <span
                aria-hidden="true"
                className="absolute top-0 h-0.5 w-8 rounded-full bg-primary"
              />
            )}
            <MoreHorizontal size={20} strokeWidth={moreActive || sheetOpen ? 2.25 : 1.75} className="shrink-0" />
            <span className="w-full truncate px-0.5 text-center text-[10px] font-semibold leading-none">
              Plus
            </span>
          </button>
        </div>
      </nav>

      {/* Bottom sheet « Plus » */}
      {sheetOpen && (
        <MoreSheet
          role={role}
          unreadCount={unreadCount}
          userName={userName}
          onClose={closeSheet}
          returnFocusRef={plusButtonRef}
        />
      )}
    </>
  );
}
