"use client";

/**
 * Dialogue de création / édition d'une séance récurrente.
 * Accessible (aria-modal, focus trap, Échap, focus restitué), s'adapte au
 * tactile (plein écran sous sm), preview colorée de la matière, détection de
 * conflit côté client à titre indicatif — le serveur revalide toujours.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarPlus, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { DAY_LONG_LABELS } from "@/lib/schedule/dates";
import { findConflict, type ConflictCandidate, type ExistingSession } from "@/lib/schedule/conflicts";
import { getSubjectColor } from "@/lib/constants/subjectColors";
import type { SessionRecurrence } from "@/lib/schedule/occurrences";
import { cn } from "@/lib/utils";

export interface SessionFormValues {
  subjectId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  room: string;
  teacher: string;
  validFrom: string;
  validUntil: string;
  publish: boolean;
}

export interface SessionFormDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (values: SessionFormValues) => Promise<{ error?: string }>;
  subjects: Array<{ id: string; name: string; colorKey: string }>;
  /** Toutes les séances de la classe (conflits). */
  allSessions: SessionRecurrence[];
  /** Valeurs pré-remplies (édition) ; null = création. */
  initial: (Partial<SessionFormValues> & { sessionId?: string }) | null;
  defaultValidFrom: string;
  title: string;
}

export function SessionFormDialog({
  open,
  onClose,
  onSubmit,
  subjects,
  allSessions,
  initial,
  defaultValidFrom,
  title,
}: SessionFormDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pendingRef = useRef(false);
  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  const [subjectId, setSubjectId] = useState("");
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("10:00");
  const [room, setRoom] = useState("");
  const [teacher, setTeacher] = useState("");
  const [validFrom, setValidFrom] = useState(defaultValidFrom);
  const [validUntil, setValidUntil] = useState("");
  const [publish, setPublish] = useState(true);

  // (Ré)initialisation à chaque ouverture.
  useEffect(() => {
    if (!open) return;
    setError(null);
    setSubjectId(initial?.subjectId ?? "");
    setDayOfWeek(initial?.dayOfWeek ?? 1);
    setStartTime(initial?.startTime ?? "08:00");
    setEndTime(initial?.endTime ?? "10:00");
    setRoom(initial?.room ?? "");
    setTeacher(initial?.teacher ?? "");
    setValidFrom(initial?.validFrom ?? defaultValidFrom);
    setValidUntil(initial?.validUntil ?? "");
    setPublish(initial?.publish ?? true);
  }, [open, initial, defaultValidFrom]);

  // Piège de focus + Échap + focus restitué.
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

  const selectedSubject = useMemo(
    () => subjects.find((s) => s.id === subjectId),
    [subjects, subjectId]
  );
  const previewColor = getSubjectColor(selectedSubject?.colorKey);

  // Indication de conflit côté client (le serveur revalide).
  const clientConflict = useMemo(() => {
    if (!startTime || !endTime || startTime >= endTime) return false;
    const candidate: ConflictCandidate = {
      excludeSessionId: initial?.sessionId ?? null,
      dayOfWeek,
      startTime,
      endTime,
      validFrom,
      validUntil: validUntil || null,
    };
    const existing: ExistingSession[] = allSessions.map((s) => ({
      id: s.id,
      dayOfWeek: s.dayOfWeek,
      startTime: s.startTime,
      endTime: s.endTime,
      validFrom: s.validFrom,
      validUntil: s.validUntil,
    }));
    return findConflict(candidate, existing) !== null;
  }, [allSessions, dayOfWeek, startTime, endTime, validFrom, validUntil, initial?.sessionId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pendingRef.current) return;
    setPending(true);
    setError(null);
    try {
      const res = await onSubmit({
        subjectId,
        dayOfWeek,
        startTime,
        endTime,
        room: room.trim(),
        teacher: teacher.trim(),
        validFrom,
        validUntil: validUntil.trim(),
        publish,
      });
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
        aria-labelledby="session-form-title"
        className="relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-border bg-card shadow-float animate-slide-in-up focus:outline-none sm:max-w-lg sm:animate-scale-in sm:rounded-2xl"
      >
        {/* En-tête */}
        <div className="flex items-center justify-between gap-3 border-b border-border/70 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <CalendarPlus size={17} />
            </span>
            <h2 id="session-form-title" className="truncate font-display text-base font-bold tracking-tight">
              {title}
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

        {/* Contenu défilant */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto overscroll-contain px-5 py-4">
          <div className="space-y-4">
            {/* Matière + preview */}
            <div className="space-y-1.5">
              <label htmlFor="sf-subject" className="text-xs font-bold text-foreground">
                Matière
              </label>
              <Select
                id="sf-subject"
                required
                value={subjectId}
                onChange={(e) => setSubjectId(e.target.value)}
              >
                <option value="">Sélectionner une matière</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
              {/* Aperçu du bloc avec la couleur persistée de la matière */}
              {selectedSubject && (
                <div
                  className={cn(
                    "mt-2 flex items-center justify-between rounded-lg border px-3 py-2",
                    previewColor.block
                  )}
                >
                  <span className="truncate text-xs font-bold">{selectedSubject.name}</span>
                  <span className="ml-2 shrink-0 text-[10px] font-semibold opacity-80">
                    {startTime} – {endTime}
                    {room ? ` · ${room}` : ""}
                  </span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="sf-day" className="text-xs font-bold text-foreground">
                  Jour
                </label>
                <Select
                  id="sf-day"
                  required
                  value={String(dayOfWeek)}
                  onChange={(e) => setDayOfWeek(Number(e.target.value))}
                >
                  {DAY_LONG_LABELS.map((label, i) => (
                    <option key={label} value={i + 1}>
                      {label.charAt(0).toUpperCase() + label.slice(1)}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label htmlFor="sf-start" className="text-xs font-bold text-foreground">
                    Début
                  </label>
                  <Input
                    id="sf-start"
                    type="time"
                    required
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="sf-end" className="text-xs font-bold text-foreground">
                    Fin
                  </label>
                  <Input
                    id="sf-end"
                    type="time"
                    required
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="sf-room" className="text-xs font-bold text-foreground">
                  Salle (facultatif)
                </label>
                <Input
                  id="sf-room"
                  value={room}
                  maxLength={40}
                  placeholder="Ex : Amphi B"
                  onChange={(e) => setRoom(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="sf-teacher" className="text-xs font-bold text-foreground">
                  Enseignant (facultatif)
                </label>
                <Input
                  id="sf-teacher"
                  value={teacher}
                  maxLength={80}
                  placeholder="Ex : M. Ndiaye"
                  onChange={(e) => setTeacher(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="sf-valid-from" className="text-xs font-bold text-foreground">
                  Valable à partir du
                </label>
                <Input
                  id="sf-valid-from"
                  type="date"
                  required
                  value={validFrom}
                  onChange={(e) => setValidFrom(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="sf-valid-until" className="text-xs font-bold text-foreground">
                  Jusqu&apos;au (facultatif)
                </label>
                <Input
                  id="sf-valid-until"
                  type="date"
                  value={validUntil}
                  min={validFrom || undefined}
                  onChange={(e) => setValidUntil(e.target.value)}
                />
              </div>
            </div>

            {/* Publication */}
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-muted/30 p-3.5">
              <input
                type="checkbox"
                checked={publish}
                onChange={(e) => setPublish(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-[hsl(var(--primary))]"
              />
              <span>
                <span className="block text-xs font-bold text-foreground">
                  Publier immédiatement
                </span>
                <span className="mt-0.5 block text-[11px] leading-relaxed text-muted-foreground">
                  Décochez pour enregistrer un brouillon : visible uniquement par les délégués et
                  l&apos;administration, sans notification.
                </span>
              </span>
            </label>

            {/* Avertissement de conflit (indicatif) */}
            {clientConflict && (
              <div
                role="alert"
                className="flex items-center gap-2 rounded-xl border border-warning/30 bg-warning/8 px-3.5 py-2.5 text-xs font-semibold text-warning"
              >
                Chevauchement possible avec une séance existante — l&apos;enregistrement sera
                refusé si le conflit est confirmé.
              </div>
            )}

            {error && (
              <div
                role="alert"
                className="rounded-xl border border-danger/30 bg-danger/8 px-3.5 py-2.5 text-xs font-semibold text-danger animate-fade-in"
              >
                {error}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="mt-5 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
            <Button ref={cancelRef} type="button" variant="outline" onClick={onClose} disabled={pending}>
              Annuler
            </Button>
            <Button type="submit" isLoading={pending} loadingText="Enregistrement…">
              {initial?.sessionId ? "Enregistrer" : publish ? "Créer et publier" : "Enregistrer le brouillon"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
