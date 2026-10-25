"use client";

/**
 * Dialogue de détails d'une occurrence (vue étudiant) avec actions de gestion
 * pour les délégués/admins : annuler / déplacer / changer de salle à une date
 * précise (exception ponctuelle — ne modifie jamais la règle récurrente).
 */

import { useEffect, useRef, useState } from "react";
import {
  Ban,
  CalendarX2,
  Clock,
  MapPin,
  MoveRight,
  Pencil,
  User,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import type { Occurrence } from "@/lib/schedule/occurrences";
import { getSubjectColor } from "@/lib/constants/subjectColors";
import { formatYmdLong, minutesToTime } from "@/lib/schedule/dates";
import { cn } from "@/lib/utils";

export type ExceptionMode = "cancel" | "move" | "room";

export interface SessionDetailDialogProps {
  occurrence: Occurrence;
  subjectName: string;
  colorKey: string;
  canManage: boolean;
  pending?: boolean;
  error?: string | null;
  onClose: () => void;
  onEdit?: () => void;
  onException: (mode: ExceptionMode, values: { startTime?: string; endTime?: string; room?: string; note?: string }) => void;
}

export function SessionDetailDialog({
  occurrence,
  subjectName,
  colorKey,
  canManage,
  pending,
  error,
  onClose,
  onEdit,
  onException,
}: SessionDetailDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [mode, setMode] = useState<ExceptionMode | null>(null);
  const [startTime, setStartTime] = useState(minutesToTime(occurrence.startMinutes));
  const [endTime, setEndTime] = useState(minutesToTime(occurrence.endMinutes));
  const [room, setRoom] = useState(occurrence.room ?? "");
  const [note, setNote] = useState("");

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
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
  }, [onClose]);

  const color = getSubjectColor(colorKey);

  const kindLabel =
    occurrence.kind === "cancelled"
      ? "Annulée"
      : occurrence.kind === "moved" || occurrence.kind === "moved_room"
      ? "Déplacée"
      : occurrence.kind === "room_changed"
      ? "Salle modifiée"
      : occurrence.kind === "replaced"
      ? "Matière remplacée"
      : null;

  const submitException = (e: React.FormEvent) => {
    e.preventDefault();
    if (!mode) return;
    onException(mode, {
      startTime,
      endTime,
      room: room.trim(),
      note: note.trim(),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in"
        aria-hidden="true"
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-detail-title"
        className="relative flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-border bg-card shadow-float animate-slide-in-up focus:outline-none sm:max-w-md sm:animate-scale-in sm:rounded-2xl"
      >
        {/* Bandeau couleur matière */}
        <div className={cn("flex items-start justify-between gap-3 px-5 pb-4 pt-5", color.block)}>
          <div className="min-w-0">
            <h2
              id="session-detail-title"
              className="truncate font-display text-lg font-bold tracking-tight"
            >
              {subjectName}
            </h2>
            <p className="mt-0.5 text-xs font-semibold capitalize opacity-80">
              {formatYmdLong(occurrence.date)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-all hover:bg-foreground/10 active:scale-95"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4">
          {/* Horaires + salle */}
          <div className="space-y-2.5">
            <div className="flex items-center gap-2.5 text-sm">
              <Clock size={15} className="shrink-0 text-muted-foreground" />
              <span className="font-semibold text-foreground">
                {minutesToTime(occurrence.startMinutes)} – {minutesToTime(occurrence.endMinutes)}
              </span>
              {occurrence.cancelled && (
                <Badge variant="danger" className="text-[10px]">
                  <Ban size={10} />
                  Annulée
                </Badge>
              )}
              {!occurrence.cancelled && kindLabel && (
                <Badge variant="warning" className="text-[10px]">
                  <MoveRight size={10} />
                  {kindLabel}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2.5 text-sm">
              <MapPin size={15} className="shrink-0 text-muted-foreground" />
              <span className="text-foreground">{occurrence.room ?? "Salle non renseignée"}</span>
            </div>
            {occurrence.teacher && (
              <div className="flex items-center gap-2.5 text-sm">
                <User size={15} className="shrink-0 text-muted-foreground" />
                <span className="text-foreground">{occurrence.teacher}</span>
              </div>
            )}
            {occurrence.note && (
              <p className="rounded-xl border border-border bg-muted/40 px-3.5 py-2.5 text-xs italic leading-relaxed text-muted-foreground">
                {occurrence.note}
              </p>
            )}
          </div>

          {/* Actions de gestion (délégués / admins) */}
          {canManage && (
            <div className="mt-5 border-t border-border/70 pt-4">
              {!mode ? (
                <>
                  <p className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                    Gérer cette séance
                  </p>
                  <p className="mb-3 text-[11px] leading-relaxed text-muted-foreground">
                    Les modifications ci-dessous ne concernent que le{" "}
                    <strong>{formatYmdLong(occurrence.date)}</strong> — la règle récurrente reste
                    inchangée.
                  </p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-auto flex-col gap-1.5 py-3"
                      onClick={() => setMode("cancel")}
                      disabled={occurrence.cancelled}
                    >
                      <CalendarX2 size={16} className="text-danger" />
                      Annuler
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-auto flex-col gap-1.5 py-3"
                      onClick={() => setMode("move")}
                    >
                      <MoveRight size={16} className="text-warning" />
                      Déplacer
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-auto flex-col gap-1.5 py-3"
                      onClick={() => setMode("room")}
                    >
                      <MapPin size={16} className="text-info" />
                      Salle
                    </Button>
                  </div>
                  {onEdit && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="mt-2 w-full gap-2"
                      onClick={onEdit}
                    >
                      <Pencil size={13} />
                      Modifier la règle récurrente
                    </Button>
                  )}
                </>
              ) : (
                <form onSubmit={submitException} className="space-y-3">
                  <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                    {mode === "cancel"
                      ? "Annuler cette séance"
                      : mode === "move"
                      ? "Déplacer cette séance"
                      : "Changer de salle"}
                  </p>

                  {mode === "move" && (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label htmlFor="exc-start" className="text-xs font-bold text-foreground">
                          Nouveau début
                        </label>
                        <Input
                          id="exc-start"
                          type="time"
                          required
                          value={startTime}
                          onChange={(e) => setStartTime(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label htmlFor="exc-end" className="text-xs font-bold text-foreground">
                          Nouvelle fin
                        </label>
                        <Input
                          id="exc-end"
                          type="time"
                          required
                          value={endTime}
                          onChange={(e) => setEndTime(e.target.value)}
                        />
                      </div>
                    </div>
                  )}

                  {mode === "room" && (
                    <div className="space-y-1.5">
                      <label htmlFor="exc-room" className="text-xs font-bold text-foreground">
                        Nouvelle salle
                      </label>
                      <Input
                        id="exc-room"
                        required
                        maxLength={40}
                        value={room}
                        placeholder="Ex : Amphi C"
                        onChange={(e) => setRoom(e.target.value)}
                      />
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label htmlFor="exc-note" className="text-xs font-bold text-foreground">
                      Note (facultatif)
                    </label>
                    <Input
                      id="exc-note"
                      maxLength={200}
                      value={note}
                      placeholder="Ex : contrôle en salle 204"
                      onChange={(e) => setNote(e.target.value)}
                    />
                  </div>

                  {error && (
                    <div
                      role="alert"
                      className="rounded-xl border border-danger/30 bg-danger/8 px-3.5 py-2.5 text-xs font-semibold text-danger"
                    >
                      {error}
                    </div>
                  )}

                  <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <Button type="button" variant="outline" size="sm" onClick={() => setMode(null)}>
                      Retour
                    </Button>
                    <Button
                      type="submit"
                      size="sm"
                      isLoading={pending}
                      variant={mode === "cancel" ? "danger" : "default"}
                    >
                      {mode === "cancel" ? "Confirmer l'annulation" : "Appliquer"}
                    </Button>
                  </div>
                </form>
              )}
            </div>
          )}

          {!canManage && (
            <p className="mt-5 border-t border-border/70 pt-4 text-[11px] leading-relaxed text-muted-foreground">
              Toute modification officielle de l&apos;emploi du temps est publiée par les
              délégués de la classe et notifiée aux étudiants.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
