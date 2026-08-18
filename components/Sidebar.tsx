"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { logoutAction } from "@/actions/auth";
import type { UserRole } from "@/types/database.types";
import {
  LayoutDashboard,
  CheckSquare,
  FileText,
  Lightbulb,
  Video,
  MessageSquare,
  Bell,
  BarChart3,
  Shield,
  LogOut,
  Menu,
  X,
  GraduationCap,
  Sparkles,
  ChevronRight,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";

const NAV_MAIN = [
  { href: "/dashboard", label: "Accueil", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/tasks", label: "Tâches & Devoirs", icon: CheckSquare },
  { href: "/dashboard/documents", label: "Documents", icon: FileText },
  { href: "/dashboard/hints", label: "Hints & Sujets", icon: Lightbulb },
  { href: "/dashboard/recordings", label: "Cours enregistrés", icon: Video },
];

const NAV_COMMUNITY = [
  { href: "/dashboard/chat", label: "Chat de classe", icon: MessageSquare },
  { href: "/dashboard/notifications", label: "Notifications", icon: Bell },
];

const NAV_STATS = { href: "/dashboard/stats", label: "Statistiques", icon: BarChart3 };

function NavGroup({
  title,
  items,
  role,
  onNavigate,
}: {
  title: string;
  items: { href: string; label: string; icon: any; exact?: boolean }[];
  role: UserRole;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <div className="space-y-0.5">
      <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/60">
        {title}
      </p>
      {items.map(({ href, label, icon: Icon, exact }) => {
        const isActive = exact
          ? pathname === href || pathname === "/dashboard/student" || pathname === "/dashboard/delegate"
          : pathname.startsWith(href);

        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={isActive ? "page" : undefined}
            className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150 ${
              isActive
                ? "bg-primary/8 text-foreground"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            }`}
          >
            {isActive && (
              <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-primary" />
            )}
            <Icon
              size={17}
              strokeWidth={isActive ? 2.25 : 1.75}
              className={`shrink-0 transition-colors duration-150 ${
                isActive ? "text-primary" : "text-muted-foreground/70 group-hover:text-foreground"
              }`}
            />
            <span className="flex-1 truncate">{label}</span>
            {isActive && (
              <ChevronRight
                size={13}
                className="text-primary/50 transition-transform group-hover:translate-x-0.5"
              />
            )}
          </Link>
        );
      })}
    </div>
  );
}

function SidebarContent({ role, onNavigate }: { role: UserRole; onNavigate?: () => void }) {
  const pathname = usePathname();

  const communityItems =
    role === "STUDENT" ? [...NAV_COMMUNITY] : [...NAV_COMMUNITY, NAV_STATS];

  return (
    <div className="flex h-full flex-col">
      {/* Marque */}
      <div className="mb-7 flex items-center gap-3 px-2">
        <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-subtle">
          <GraduationCap size={20} strokeWidth={2} />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-display text-lg font-bold tracking-tight text-foreground">ClassPulse</span>
            <Badge variant="outline" className="px-1.5 py-0 text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
              Bêta
            </Badge>
          </div>
          <p className="truncate text-[11px] font-medium text-muted-foreground">
            {role === "ADMIN" ? "Administration" : role === "DELEGATE" ? "Délégué de classe" : "Espace étudiant"}
          </p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-6 overflow-y-auto">
        <NavGroup title="Menu principal" items={NAV_MAIN} role={role} onNavigate={onNavigate} />
        <NavGroup title="Communauté" items={communityItems} role={role} onNavigate={onNavigate} />

        {role === "ADMIN" && (
          <div className="space-y-0.5">
            <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/60">
              Administration
            </p>
            <Link
              href="/dashboard/admin"
              onClick={onNavigate}
              aria-current={pathname.startsWith("/dashboard/admin") ? "page" : undefined}
              className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
                pathname.startsWith("/dashboard/admin")
                  ? "bg-danger/8 text-danger"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              }`}
            >
              {pathname.startsWith("/dashboard/admin") && (
                <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-danger" />
              )}
              <Shield size={17} strokeWidth={pathname.startsWith("/dashboard/admin") ? 2.25 : 1.75} className="shrink-0" />
              <span>Administration</span>
            </Link>
          </div>
        )}
      </nav>

      {/* Pied */}
      <div className="mt-4 space-y-3 border-t border-border/70 pt-4">
        <div className="brand-card rounded-xl p-3.5">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
              <Sparkles size={14} strokeWidth={2} />
            </div>
            <span className="text-xs font-bold text-foreground">Assistant IA</span>
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
            Une question sur un cours ou du code ? Interrogez l&apos;assistant depuis le bouton flottant.
          </p>
        </div>

        <div className="flex items-center justify-between px-1">
          <span className="text-xs font-medium text-muted-foreground">Votre rôle</span>
          <Badge variant={role === "ADMIN" ? "danger" : role === "DELEGATE" ? "warning" : "neutral"}>
            {role === "ADMIN" ? "Administrateur" : role === "DELEGATE" ? "Délégué" : "Étudiant"}
          </Badge>
        </div>

        <form action={logoutAction}>
          <button
            type="submit"
            className="group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition-all hover:bg-danger/8 hover:text-danger"
          >
            <LogOut size={17} strokeWidth={1.75} className="shrink-0 transition-transform group-hover:-translate-x-0.5" />
            <span>Déconnexion</span>
          </button>
        </form>
      </div>
    </div>
  );
}

export function Sidebar({ role }: { role: UserRole }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      {/* ── En-tête mobile ── */}
      <div className="sticky top-0 z-40 flex items-center justify-between border-b border-border/70 bg-background/90 px-4 py-3 backdrop-blur-md md:hidden">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-subtle">
            <GraduationCap size={17} strokeWidth={2} />
          </div>
          <span className="font-display text-base font-bold tracking-tight text-foreground">ClassPulse</span>
        </Link>

        <button
          onClick={() => setOpen(true)}
          aria-label="Ouvrir le menu de navigation"
          aria-expanded={open}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card text-foreground transition-all hover:border-primary/40 hover:bg-muted active:scale-95"
        >
          <Menu size={18} />
        </button>
      </div>

      {/* ── Sidebar desktop ── */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border/70 bg-card/40 p-5 md:flex">
        <SidebarContent role={role} />
      </aside>

      {/* ── Tiroir mobile ── */}
      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            aria-label="Fermer le menu"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in"
          />

          <aside
            className="absolute left-0 top-0 h-full w-80 max-w-[88vw] flex-col border-r border-border bg-card shadow-2xl animate-slide-in-left overflow-hidden"
            role="dialog"
            aria-modal="true"
            aria-label="Menu de navigation ClassPulse"
          >
            <div className="flex items-center justify-between border-b border-border/70 px-5 py-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-subtle">
                  <GraduationCap size={18} strokeWidth={2} />
                </div>
                <span className="font-display text-base font-bold tracking-tight">ClassPulse</span>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Fermer le menu"
                className="flex h-8 w-8 items-center justify-center rounded-xl text-muted-foreground transition-all hover:bg-muted hover:text-foreground active:scale-95"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              <SidebarContent role={role} onNavigate={() => setOpen(false)} />
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
