"use client";

/**
 * Dialogue de gestion des ressources de révision d'une évaluation
 * (délégués & admins). Listes de documents et hints de la classe, avec
 * recherche ; l'enregistrement remplace l'ensemble des associations.
 * Aucune ressource hors classe n'est proposée (le serveur revalide).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, FileText, Search, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { ClassResourceDocument, ClassResourceHint } from "@/lib/evaluations/queries";

export interface EvaluationResourcesDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (documentIds: string[], hintIds: string[]) => Promise<{ error?: string }>;
  documents: ClassResourceDocument[];
  hints: ClassResourceHint[];
  subjects: Array<{ id: string; name: string }>;
  initialDocumentIds: string[];
  initialHintIds: string[];
}

export function EvaluationResourcesDialog({
  open,
  onClose,
  onSubmit,
  documents,
  hints,
  subjects,
  initialDocumentIds,
  initialHintIds,
}: EvaluationResourcesDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pendingRef = useRef(false);
  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  const [docIds, setDocIds] = useState<string[]>(initialDocumentIds);
  const [hintIds, setHintIds] = useState<string[]>(initialHintIds);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) return;
    setError(null);
    setDocIds(initialDocumentIds);
    setHintIds(initialHintIds);
    setQuery("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (pendingRef.current) return;
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !dialogRef.current) return;
      const focusables = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
      );
      if (focusables.length === 0) return;
      const first = focusables[0] as HTMLElement;
      const last = focusables[focusables.length - 1] as HTMLElement;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previousFocus?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, onClose]);

  const subjectNames = useMemo(
    () => Object.fromEntries(subjects.map((s) => [s.id, s.name])),
    [subjects]
  );

  const matches = (title: string) =>
    query.trim() === "" || title.toLowerCase().includes(query.trim().toLowerCase());

  const visibleDocuments = documents.filter((d) => matches(d.title));
  const visibleHints = hints.filter((h) => matches(h.title) || matches(h.year));

  const toggle = (list: string[], id: string, set: (v: string[]) => void) =>
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pendingRef.current) return;
    setPending(true);
    setError(null);
    try {
      const res = await onSubmit(docIds, hintIds);
      if (res?.error) {
        setError(res.error);
        setPending(false);
        return;
      }
      setPending(false);
      onClose();
    } catch {
      setError("Une erreur est survenue. Réessayez.");
      setPending(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in"
        aria-hidden="true"
        onClick={() => {
          if (!pending) onClose();
        }}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="evaluation-resources-title"
        className="relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-border bg-card shadow-float animate-slide-in-up focus:outline-none sm:max-w-lg sm:animate-scale-in sm:rounded-2xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-border/70 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <BookOpen size={17} />
            </span>
            <h2 id="evaluation-resources-title" className="truncate font-display text-base font-bold tracking-tight">
              Ressources de révision
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-all hover:bg-muted hover:text-foreground active:scale-95"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto overscroll-contain px-5 py-4">
          <div className="space-y-4">
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Facultatif : associez des supports déjà partagés dans la classe pour aider les
              révisions. Seuls les documents et hints de la classe sont listés.
            </p>

            <div className="relative">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label="Rechercher une ressource"
                value={query}
                placeholder="Rechercher par titre…"
                className="pl-9"
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>

            {/* Documents */}
            <section aria-label="Documents de la classe" className="space-y-2">
              <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                <FileText size={13} />
                Documents ({visibleDocuments.length})
              </h3>
              {visibleDocuments.length === 0 ? (
                <p className="text-xs text-muted-foreground">Aucun document dans la classe.</p>
              ) : (
                <ul className="max-h-52 space-y-1 overflow-y-auto overscroll-contain rounded-xl border border-border/70 p-1.5">
                  {visibleDocuments.map((d) => (
                    <li key={d.id}>
                      <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/60">
                        <input
                          type="checkbox"
                          checked={docIds.includes(d.id)}
                          onChange={() => toggle(docIds, d.id, setDocIds)}
                          className="h-4 w-4 shrink-0 accent-[hsl(var(--primary))]"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-semibold text-foreground">{d.title}</span>
                          <span className="block truncate text-[10px] text-muted-foreground">
                            {subjectNames[d.subjectId] ?? "Matière"}
                          </span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Hints & annales */}
            <section aria-label="Hints et annales de la classe" className="space-y-2">
              <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                <BookOpen size={13} />
                Hints &amp; annales ({visibleHints.length})
              </h3>
              {visibleHints.length === 0 ? (
                <p className="text-xs text-muted-foreground">Aucun hint dans la classe.</p>
              ) : (
                <ul className="max-h-52 space-y-1 overflow-y-auto overscroll-contain rounded-xl border border-border/70 p-1.5">
                  {visibleHints.map((h) => (
                    <li key={h.id}>
                      <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/60">
                        <input
                          type="checkbox"
                          checked={hintIds.includes(h.id)}
                          onChange={() => toggle(hintIds, h.id, setHintIds)}
                          className="h-4 w-4 shrink-0 accent-[hsl(var(--primary))]"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-semibold text-foreground">{h.title}</span>
                          <span className="block truncate text-[10px] text-muted-foreground">
                            {h.year} · {h.type.charAt(0) + h.type.slice(1).toLowerCase()} ·{" "}
                            {subjectNames[h.subjectId] ?? "Matière"}
                          </span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {error && (
              <div
                role="alert"
                className="rounded-xl border border-danger/30 bg-danger/8 px-3.5 py-2.5 text-xs font-semibold text-danger animate-fade-in"
              >
                {error}
              </div>
            )}
          </div>

          <div className="mt-5 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
            <Button ref={cancelRef} type="button" variant="outline" onClick={onClose} disabled={pending}>
              Annuler
            </Button>
            <Button type="submit" isLoading={pending}>
              Enregistrer
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
