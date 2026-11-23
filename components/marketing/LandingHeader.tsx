"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Menu, X } from "lucide-react";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

const SECTION_LINKS = [
  { href: "#bibliotheque", label: "Bibliothèque" },
  { href: "#communautes", label: "Communauté" },
  { href: "#assistant", label: "Assistant" },
  { href: "#fonctionnement", label: "Fonctionnement" },
];

/**
 * En-tête public de la landing : une seule barre sur mobile, menu dépliant
 * accessible (clavier, Échap, clic extérieur), navigation complète à partir
 * de lg et sélecteur de thème dans la barre à partir de xl.
 */
export function LandingHeader() {
  const [open, setOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef(false);

  function close(returnFocus = false) {
    returnFocusRef.current = returnFocus;
    setOpen(false);
  }

  // Le menu n'existe plus à partir de xl : évite un panneau orphelin au redimensionnement.
  useEffect(() => {
    const largeScreen = window.matchMedia("(min-width: 1280px)");
    const onChange = () => {
      if (largeScreen.matches) close();
    };
    largeScreen.addEventListener("change", onChange);
    return () => largeScreen.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (!open) {
      if (returnFocusRef.current) {
        toggleRef.current?.focus({ preventScroll: true });
        returnFocusRef.current = false;
      }
      return;
    }

    panelRef.current?.querySelector<HTMLElement>("a, button")?.focus({ preventScroll: true });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close(true);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!headerRef.current?.contains(event.target as Node)) close(true);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  return (
    <header ref={headerRef} className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link href="/" className="group flex shrink-0 items-center gap-2.5" onClick={() => close()}>
          <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl border border-border bg-white shadow-subtle transition-transform duration-200 group-hover:scale-105">
            <img src="/logo-mark.png" alt="" width={36} height={36} className="h-full w-full object-contain" />
          </div>
          <span className="whitespace-nowrap font-display text-lg font-bold tracking-tight text-foreground">
            ClassPulse
          </span>
        </Link>

        {/* Navigation horizontale : lg → xl (le menu dépliant prend le relais en dessous). */}
        <nav aria-label="Navigation principale" className="hidden items-center gap-4 whitespace-nowrap text-sm font-medium text-muted-foreground lg:flex xl:gap-7">
          {SECTION_LINKS.map(({ href, label }) => (
            <a key={href} href={href} className="transition-colors hover:text-foreground">
              {label}
            </a>
          ))}
        </nav>

        {/* Actions desktop : thème + connexion à partir de xl. */}
        <div className="hidden items-center gap-2 sm:gap-3 xl:flex">
          <ThemeToggle />
          <Link
            href="/login"
            className="inline-flex h-10 items-center justify-center whitespace-nowrap rounded-xl border border-border px-4 text-sm font-semibold transition-all hover:border-primary/40 hover:bg-muted"
          >
            Se connecter
          </Link>
          <Link
            href="/register"
            className="group inline-flex h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-subtle transition-all hover:bg-primary/90 hover:shadow-lift"
          >
            Rejoindre
            <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>

        {/* Actions intermédiaires + bouton de menu : masqués à partir de xl. */}
        <div className="flex shrink-0 items-center gap-2 sm:gap-3 xl:hidden">
          <Link
            href="/login"
            className="hidden h-10 items-center justify-center whitespace-nowrap rounded-xl border border-border px-4 text-sm font-semibold transition-all hover:border-primary/40 hover:bg-muted sm:inline-flex"
          >
            Se connecter
          </Link>
          <Link
            href="/register"
            className="group hidden h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-subtle transition-all hover:bg-primary/90 hover:shadow-lift sm:inline-flex"
          >
            Rejoindre
            <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
          </Link>
          <button
            ref={toggleRef}
            type="button"
            data-mobile-menu-toggle
            aria-label={open ? "Fermer le menu" : "Ouvrir le menu"}
            aria-expanded={open}
            aria-controls="landing-mobile-menu"
            onClick={() => (open ? close() : setOpen(true))}
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-card text-foreground shadow-subtle transition-colors hover:bg-muted"
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      <div
        id="landing-mobile-menu"
        data-mobile-menu-panel
        ref={panelRef}
        hidden={!open}
        className="absolute inset-x-0 top-full animate-fade-in-up px-4 pb-3 sm:px-6 xl:hidden"
      >
        <nav
          aria-label="Navigation mobile"
          className="max-h-[calc(100dvh-5rem)] overflow-y-auto overscroll-contain rounded-2xl border border-border bg-card p-3 shadow-float"
        >
          <div className="lg:hidden">
            {SECTION_LINKS.map(({ href, label }) => (
              <a
                key={href}
                href={href}
                onClick={() => close()}
                className="flex min-h-11 items-center rounded-xl px-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
              >
                {label}
              </a>
            ))}
            <div className="my-2 h-px bg-border/70" />
          </div>

          <div className="px-3 pb-1 pt-1.5">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
              Thème de l&apos;interface
            </p>
            <div className="[&_[role=radio]]:min-h-11 [&_[role=radio]]:min-w-11 [&_[role=radio]]:justify-center">
              <ThemeToggle />
            </div>
          </div>

          <div className="mt-2 flex flex-col gap-2 border-t border-border/70 px-3 pb-2 pt-4 sm:hidden">
            <Link
              href="/login"
              onClick={() => close()}
              className="flex min-h-12 items-center justify-center rounded-xl border border-border px-4 text-sm font-semibold transition-colors hover:bg-muted"
            >
              Se connecter
            </Link>
            <Link
              href="/register"
              onClick={() => close()}
              className="flex min-h-12 items-center justify-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Rejoindre
              <ArrowRight size={15} />
            </Link>
          </div>
        </nav>
      </div>
    </header>
  );
}
