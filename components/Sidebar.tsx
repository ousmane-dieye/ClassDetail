"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutAction } from "@/actions/auth";
import type { UserRole } from "@/types/database.types";
import { useSidebar } from "@/components/SidebarContext";
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
  GraduationCap,
  Sparkles,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { MobileBottomNav } from "@/components/mobile/MobileBottomNav";

/* ──────────────────────────────────────────────────────────────────
   Navigation items
   ────────────────────────────────────────────────────────────────── */

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

/* ──────────────────────────────────────────────────────────────────
   Tooltip wrapper (CSS-only)
   ────────────────────────────────────────────────────────────────── */

function Tooltip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="sidebar-tooltip-wrapper">
      {children}
      <span className="sidebar-tooltip" aria-hidden="true">
        {label}
      </span>
    </span>
  );
}

/* ──────────────────────────────────────────────────────────────────
   Single nav item
   ────────────────────────────────────────────────────────────────── */

function NavItem({
  href,
  label,
  icon: Icon,
  exact,
  isActive,
  collapsed,
  onNavigate,
  danger,
}: {
  href: string;
  label: string;
  icon: any;
  exact?: boolean;
  isActive: boolean;
  collapsed: boolean;
  onNavigate?: () => void;
  danger?: boolean;
}) {
  const baseClass = `group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150`;
  const activeClass = danger
    ? "bg-danger/8 text-danger"
    : "bg-primary/8 text-foreground";
  const inactiveClass = "text-muted-foreground hover:bg-muted/60 hover:text-foreground";
  const indicatorColor = danger ? "bg-danger" : "bg-primary";

  const link = (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={isActive ? "page" : undefined}
      title={collapsed ? label : undefined}
      className={`${baseClass} ${isActive ? activeClass : inactiveClass} ${
        collapsed ? "justify-center px-0" : ""
      }`}
    >
      {isActive && (
        <span
          className={`absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full ${indicatorColor} ${
            collapsed ? "hidden" : ""
          }`}
        />
      )}
      <Icon
        size={17}
        strokeWidth={isActive ? 2.25 : 1.75}
        className={`shrink-0 transition-colors duration-150 ${
          isActive
            ? danger
              ? "text-danger"
              : "text-primary"
            : "text-muted-foreground/70 group-hover:text-foreground"
        }`}
      />
      {!collapsed && (
        <>
          <span className="flex-1 truncate">{label}</span>
          {isActive && (
            <ChevronRight
              size={13}
              className="text-primary/50 transition-transform group-hover:translate-x-0.5"
            />
          )}
        </>
      )}
    </Link>
  );

  if (collapsed) {
    return <Tooltip label={label}>{link}</Tooltip>;
  }

  return link;
}

/* ──────────────────────────────────────────────────────────────────
   Nav group
   ────────────────────────────────────────────────────────────────── */

function NavGroup({
  title,
  items,
  role,
  collapsed,
  onNavigate,
}: {
  title: string;
  items: { href: string; label: string; icon: any; exact?: boolean }[];
  role: UserRole;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <div className="space-y-0.5">
      {!collapsed && (
        <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/60">
          {title}
        </p>
      )}
      {collapsed && <div className="mb-1 h-px bg-border/60 mx-2" />}
      {items.map(({ href, label, icon: Icon, exact }) => {
        const isActive = exact
          ? pathname === href ||
            pathname === "/dashboard/student" ||
            pathname === "/dashboard/delegate"
          : pathname.startsWith(href);

        return (
          <NavItem
            key={href}
            href={href}
            label={label}
            icon={Icon}
            exact={exact}
            isActive={isActive}
            collapsed={collapsed}
            onNavigate={onNavigate}
          />
        );
      })}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────
   Sidebar content (shared between desktop & mobile drawer)
   ────────────────────────────────────────────────────────────────── */

function SidebarContent({
  role,
  collapsed,
  onNavigate,
  showToggle,
}: {
  role: UserRole;
  collapsed: boolean;
  onNavigate?: () => void;
  showToggle?: boolean;
}) {
  const pathname = usePathname();
  const { toggle } = useSidebar();

  const communityItems =
    role === "STUDENT" ? [...NAV_COMMUNITY] : [...NAV_COMMUNITY, NAV_STATS];

  const isAdminActive = pathname.startsWith("/dashboard/admin");

  return (
    <div className="flex h-full flex-col">
      {/* ── Logo / Brand + Toggle ── */}
      {collapsed ? (
        /* Mode réduit : logo centré, toggle juste en dessous */
        <div className="mb-7 flex flex-col items-center gap-2">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-subtle">
            <GraduationCap size={20} strokeWidth={2} />
          </div>

          {showToggle && (
            <Tooltip label="Étendre la sidebar">
              <button
                onClick={toggle}
                aria-label="Étendre la sidebar"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-foreground/60 transition-all hover:bg-muted hover:text-foreground"
              >
                <PanelLeftOpen size={15} strokeWidth={1.75} />
              </button>
            </Tooltip>
          )}
        </div>
      ) : (
        /* Mode étendu : logo + texte marque à gauche, toggle calé à droite */
        <div
          className={`relative mb-7 flex items-center gap-3 px-2 ${
            showToggle ? "pr-10" : ""
          }`}
        >
          <div className="flex min-w-0 items-center gap-3">
            <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-subtle">
              <GraduationCap size={20} strokeWidth={2} />
            </div>

            <div className="min-w-0">
              <span className="font-display text-lg font-bold tracking-tight text-foreground">
                ClassPulse
              </span>
              <p className="truncate text-[11px] font-medium text-muted-foreground">
                {role === "ADMIN"
                  ? "Administration"
                  : role === "DELEGATE"
                  ? "Délégué de classe"
                  : "Espace étudiant"}
              </p>
            </div>
          </div>

          {/* Bouton toggle (desktop uniquement) — ancré à droite, jamais sur le titre */}
          {showToggle && (
            <div className="absolute right-0 top-1/2 -translate-y-1/2">
              <Tooltip label="Réduire la sidebar">
                <button
                  onClick={toggle}
                  aria-label="Réduire la sidebar"
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-foreground/60 transition-all hover:bg-muted hover:text-foreground"
                >
                  <PanelLeftClose size={15} strokeWidth={1.75} />
                </button>
              </Tooltip>
            </div>
          )}
        </div>
      )}

      {/* ── Navigation ── */}
      <nav className="flex-1 space-y-6 overflow-y-auto">
        <NavGroup
          title="Menu principal"
          items={NAV_MAIN}
          role={role}
          collapsed={collapsed}
          onNavigate={onNavigate}
        />
        <NavGroup
          title="Communauté"
          items={communityItems}
          role={role}
          collapsed={collapsed}
          onNavigate={onNavigate}
        />

        {role === "ADMIN" && (
          <div className="space-y-0.5">
            {!collapsed && (
              <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/60">
                Administration
              </p>
            )}
            {collapsed && <div className="mb-1 h-px bg-border/60 mx-2" />}
            <NavItem
              href="/dashboard/admin"
              label="Administration"
              icon={Shield}
              isActive={isAdminActive}
              collapsed={collapsed}
              onNavigate={onNavigate}
              danger
            />
          </div>
        )}
      </nav>

      {/* ── Footer ── */}
      <div className="mt-4 space-y-3 border-t border-border/70 pt-4">
        {!collapsed && (
          <div className="brand-card rounded-xl p-3.5">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
                <Sparkles size={14} strokeWidth={2} />
              </div>
              <span className="text-xs font-bold text-foreground">Assistant IA</span>
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
              Une question sur un cours ou du code ? Interrogez l&apos;assistant depuis
              le bouton flottant.
            </p>
          </div>
        )}

        {collapsed && (
          <Tooltip label="Assistant IA">
            <div className="flex items-center justify-center rounded-xl py-2 text-muted-foreground/70">
              <Sparkles size={17} strokeWidth={1.75} />
            </div>
          </Tooltip>
        )}

        {!collapsed && (
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-medium text-muted-foreground">Votre rôle</span>
            <Badge
              variant={
                role === "ADMIN" ? "danger" : role === "DELEGATE" ? "warning" : "neutral"
              }
            >
              {role === "ADMIN"
                ? "Administrateur"
                : role === "DELEGATE"
                ? "Délégué"
                : "Étudiant"}
            </Badge>
          </div>
        )}

        <form action={logoutAction}>
          {collapsed ? (
            <Tooltip label="Déconnexion">
              <button
                type="submit"
                className="group flex w-full items-center justify-center rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition-all hover:bg-danger/8 hover:text-danger"
              >
                <LogOut
                  size={17}
                  strokeWidth={1.75}
                  className="shrink-0 transition-transform group-hover:-translate-x-0.5"
                />
              </button>
            </Tooltip>
          ) : (
            <button
              type="submit"
              className="group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition-all hover:bg-danger/8 hover:text-danger"
            >
              <LogOut
                size={17}
                strokeWidth={1.75}
                className="shrink-0 transition-transform group-hover:-translate-x-0.5"
              />
              <span>Déconnexion</span>
            </button>
          )}
        </form>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────
   Main export
   ────────────────────────────────────────────────────────────────── */

export function Sidebar({
  role,
  unreadCount = 0,
  userName,
}: {
  role: UserRole;
  unreadCount?: number;
  userName?: string;
}) {
  const { collapsed } = useSidebar();

  return (
    <>
      {/* ── Mobile : bottom navigation fixe en bas d'écran ── */}
      <MobileBottomNav role={role} unreadCount={unreadCount} userName={userName} />

      {/* ── Desktop collapsible sidebar ── */}
      <aside
        aria-label="Navigation principale"
        data-collapsed={collapsed}
        className={`
          hidden md:flex flex-col shrink-0
          border-r border-border/70 bg-card/40
          transition-[width,padding] duration-300 ease-in-out
          overflow-hidden
          ${collapsed ? "w-[68px] p-3" : "w-64 p-5"}
        `}
      >
        <SidebarContent role={role} collapsed={collapsed} showToggle />
      </aside>
    </>
  );
}
