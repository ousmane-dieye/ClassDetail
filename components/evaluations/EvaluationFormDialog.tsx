"use client";

/**
 * Dialogue de création / édition d'une évaluation.
 *
 * Accessible (aria-modal, focus trap, Échap, focus restitué), tactile
 * (feuille plein écran sous sm), aperçu couleur de la matière, avertissements
 * de conflit côté client (indicatifs — le serveur revalide et renvoie les
 * siens). Les chapitres sont TOUJOURS facultatifs : aucun état du formulaire
 * n'en exige pour permettre l'enregistrement.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { ClipboardCheck, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { getSubjectColor } from "@/lib/constants/subjectColors";
import { EVALUATION_TYPE_LABELS, MAX_CHAPTERS, type EvaluationView } from "@/lib/evaluations/constants";
import { evaluationConflictWarnings } from "@/lib/evaluations/conflicts";
import type { SessionException, SessionRecurrence } from "@/lib/schedule/occurrences";
import type { EvaluationType } from "@/types/database.types";
import { EVALUATION_TYPES } from "@/lib/validation/schemas";
import { cn } from "@/lib/utils";

export interface EvaluationFormValues {
  subjectId: string;
  title: string;
  type: EvaluationType;
  date: string;
  /** "HH:MM" ou "" (information inconnue). */
  startTime: string;
  endTime: string;
  room: string;
  description: string;
  /** Tableau (vide autorisé — chapitres jamais obligatoires). */
  chapters: string[];
  publish: boolean;
}

export interface EvaluationFormDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (values: EvaluationFormValues) => Promise<{ error?: string }>;
  subjects: Array<{ id: string; name: string; colorKey: string }>;
  /** Évaluations de la classe (pré-détection de conflit, hors annulées). */
  allEvaluations: EvaluationView[];
  /** Séances d'emploi du temps (pré-détection de conflit, si disponibles). */
  scheduleSessions?: SessionRecurrence[];
  scheduleExceptions?: SessionException[];
  /** Valeurs pré-remplies (édition) ; null = création. */
  initial: (Partial<EvaluationFormValues> & { id?: string }) | null;
  defaultDate: string;
  title: string;
}

export function EvaluationFormDialog({
  open,
  onClose,
  onSubmit,
  subjects,
  allEvaluations,
  scheduleSessions = [],
  scheduleExceptions = [],
  initial,
  defaultDate,
  title,
}: EvaluationFormDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pendingRef = useRef(false);
  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  const [subjectId, setSubjectId] = useState("");
  const [evalTitle, setEvalTitle] = useState("");
  const [type, setType] = useState<EvaluationType>("CC");
  const [date, setDate] = useState(defaultDate);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [room, setRoom] = useState("");
  const [description, setDescription] = useState("");
  const [chapters, setChapters] = useState<string[]>([]);
  const [chapterDraft, setChapterDraft] = useState("");
  const [publish, setPublish] = useState(true);

  // (Ré)initialisation à chaque ouverture.
  useEffect(() => {
    if (!open) return;
    setError(null);
    setSubjectId(initial?.subjectId ?? "");
    setEvalTitle(initial?.title ?? "");
    setType(initial?.type ?? "CC");
    setDate(initial?.date ?? defaultDate);
    setStartTime(initial?.startTime ?? "");
    setEndTime(initial?.endTime ?? "");
    setRoom(initial?.room ?? "");
    setDescription(initial?.description ?? "");
    setChapters(initial?.chapters ?? []);
    setChapterDraft("");
    setPublish(true);
  }, [open, initial, defaultDate]);

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

  const addChapter = () => {
    const value = chapterDraft.trim();
    if (!value || chapters.length >= MAX_CHAPTERS) return;
    if (chapters.includes(value)) {
      setChapterDraft("");
      return;
    }
    setChapters([...chapters, value]);
    setChapterDraft("");
  };
  const removeChapter = (index: number) => setChapters(chapters.filter((_, i) => i !== index));

  // Avertissement de conflit indicatif (le serveur revalide toujours).
  const conflictWarnings = useMemo(() => {
    const subjectNames: Record<string, string> = {};
    for (const s of subjects) subjectNames[s.id] = s.name;
    return evaluationConflictWarnings(
      { id: initial?.id ?? null, date, startTime: startTime || null, endTime: endTime || null },
      allEvaluations,
      scheduleSessions,
      scheduleExceptions,
      subjectNames
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjects, allEvaluations, scheduleSessions, scheduleExceptions, date, startTime, endTime, initial?.id]);

  const isEdit = Boolean(initial?.id);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pendingRef.current) return;
    setPending(true);
    setError(null);
    try {
      const res = await onSubmit({
        subjectId,
        title: evalTitle.trim(),
        type,
        date,
        startTime,
        endTime,
        room: room.trim(),
        description: description.trim(),
        chapters,
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
        aria-labelledby="evaluation-form-title"
        className="relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-border bg-card shadow-float animate-slide-in-up focus:outline-none sm:max-w-lg sm:animate-scale-in sm:rounded-2xl"
      >
        {/* En-tête */}
        <div className="flex items-center justify-between gap-3 border-b border-border/70 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <ClipboardCheck size={17} />
            </span>
            <h2 id="evaluation-form-title" className="truncate font-display text-base font-bold tracking-tight">
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
            {/* Titre */}
            <div className="space-y-1.5">
              <label htmlFor="ef-title" className="text-xs font-bold text-foreground">
                Intitulé
              </label>
              <Input
                id="ef-title"
                required
                minLength={3}
                maxLength={150}
                value={evalTitle}
                placeholder="Ex : CC de programmation"
                onChange={(e) => setEvalTitle(e.target.value)}
              />
            </div>

            {/* Matière + aperçu couleur */}
            <div className="space-y-1.5">
              <label htmlFor="ef-subject" className="text-xs font-bold text-foreground">
                Matière
              </label>
              <Select
                id="ef-subject"
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
              {selectedSubject && (
                <div className={cn("mt-2 flex items-center justify-between rounded-lg border px-3 py-2", previewColor.block)}>
                  <span className="truncate text-xs font-bold">{selectedSubject.name}</span>
                  <span className="ml-2 shrink-0 text-[10px] font-semibold opacity-80">
                    {date || "Date à définir"}
                    {startTime ? ` · ${startTime}${endTime ? `–${endTime}` : ""}` : ""}
                  </span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Type */}
              <div className="space-y-1.5">
                <label htmlFor="ef-type" className="text-xs font-bold text-foreground">
                  Type
                </label>
                <Select id="ef-type" required value={type} onChange={(e) => setType(e.target.value as EvaluationType)}>
                  {EVALUATION_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {EVALUATION_TYPE_LABELS[t]}
                    </option>
                  ))}
                </Select>
              </div>
              {/* Date */}
              <div className="space-y-1.5">
                <label htmlFor="ef-date" className="text-xs font-bold text-foreground">
                  Date
                </label>
                <Input
                  id="ef-date"
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
            </div>

            {/* Heures facultatives */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label htmlFor="ef-start" className="text-xs font-bold text-foreground">
                  Heure de début (facultative)
                </label>
                <Input
                  id="ef-start"
                  type="time"
                  value={startTime}
                  onChange={(e) => {
                    setStartTime(e.target.value);
                    if (!e.target.value) setEndTime("");
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="ef-end" className="text-xs font-bold text-foreground">
                  Heure de fin (facultative)
                </label>
                <Input
                  id="ef-end"
                  type="time"
                  value={endTime}
                  min={startTime || undefined}
                  disabled={!startTime}
                  onChange={(e) => setEndTime(e.target.value)}
                />
              </div>
            </div>

            {/* Salle facultative */}
            <div className="space-y-1.5">
              <label htmlFor="ef-room" className="text-xs font-bold text-foreground">
                Salle (facultatif)
              </label>
              <Input
                id="ef-room"
                maxLength={40}
                value={room}
                placeholder="Ex : Amphi B — laisser vide si inconnue"
                onChange={(e) => setRoom(e.target.value)}
              />
            </div>

            {/* Description facultative */}
            <div className="space-y-1.5">
              <label htmlFor="ef-description" className="text-xs font-bold text-foreground">
                Consignes (facultatif)
              </label>
              <Textarea
                id="ef-description"
                maxLength={3000}
                value={description}
                placeholder="Ex : materiel autorisé, durée…"
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            {/* Chapitres — TOUJOURS facultatifs */}
            <div className="space-y-1.5">
              <label htmlFor="ef-chapter-input" className="text-xs font-bold text-foreground">
                Chapitres concernés (facultatif)
              </label>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Tu pourras compléter cette information plus tard si le programme est communiqué.
              </p>
              {chapters.length > 0 && (
                <ul className="flex flex-wrap gap-1.5">
                  {chapters.map((chapter, index) => (
                    <li
                      key={`${chapter}-${index}`}
                      className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 py-0.5 pl-2.5 pr-1 text-[11px] font-semibold text-foreground"
                    >
                      <span className="max-w-[220px] truncate">{chapter}</span>
                      <button
                        type="button"
                        onClick={() => removeChapter(index)}
                        aria-label={`Retirer le chapitre ${chapter}`}
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger"
                      >
                        <X size={12} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {chapters.length < MAX_CHAPTERS && (
                <div className="flex gap-2">
                  <Input
                    id="ef-chapter-input"
                    maxLength={120}
                    value={chapterDraft}
                    placeholder="Ex : Chapitre 3 — Pointeurs"
                    onChange={(e) => setChapterDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addChapter();
                      }
                    }}
                  />
                  <Button type="button" variant="outline" size="icon" aria-label="Ajouter le chapitre" onClick={addChapter}>
                    <Plus size={16} />
                  </Button>
                </div>
              )}
            </div>

            {/* Publication (création uniquement) */}
            {!isEdit && (
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-muted/30 p-3.5">
                <input
                  type="checkbox"
                  checked={publish}
                  onChange={(e) => setPublish(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-[hsl(var(--primary))]"
                />
                <span>
                  <span className="block text-xs font-bold text-foreground">Publier immédiatement</span>
                  <span className="mt-0.5 block text-[11px] leading-relaxed text-muted-foreground">
                    Décochez pour enregistrer un brouillon : visible uniquement par les délégués et
                    l&apos;administration, sans notification.
                  </span>
                </span>
              </label>
            )}

            {/* Avertissements de conflit (indicatifs, jamais bloquants) */}
            {conflictWarnings.length > 0 && (
              <div role="status" className="space-y-1.5 rounded-xl border border-warning/30 bg-warning/8 px-3.5 py-2.5">
                <p className="text-xs font-bold text-warning">À vérifier avant publication</p>
                {conflictWarnings.map((warning) => (
                  <p key={warning} className="text-xs leading-relaxed text-warning/90">
                    {warning}
                  </p>
                ))}
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
            <Button type="submit" isLoading={pending}>
              {isEdit ? "Enregistrer" : publish ? "Créer et publier" : "Enregistrer le brouillon"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
