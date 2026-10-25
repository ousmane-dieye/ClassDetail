"use client";

import type { Occurrence } from "@/lib/schedule/occurrences";
import { getSubjectColor } from "@/lib/constants/subjectColors";
import { minutesToTime } from "@/lib/schedule/dates";
import { Ban, MapPin, MoveRight } from "lucide-react";
import { cn } from "@/lib/utils";

/** Nom de matière tronqué côté React (pas de line-clamp sur titre long). */
function SubjectName({ name, className }: { name: string; className?: string }) {
  return (
    <span className={cn("block truncate font-bold", className)} title={name}>
      {name}
    </span>
  );
}

/* ──────────────────────────────────────────────────────────────────
   Bloc de la grille hebdomadaire (desktop)
   ────────────────────────────────────────────────────────────────── */

export function ColoredScheduleBlock({
  occurrence,
  subjectName,
  colorKey,
  compact,
  onClick,
  style,
  className,
}: {
  occurrence: Occurrence;
  subjectName: string;
  colorKey: string;
  compact?: boolean;
  onClick?: () => void;
  style?: React.CSSProperties;
  className?: string;
}) {
  const color = getSubjectColor(colorKey);
  const time = `${minutesToTime(occurrence.startMinutes)} – ${minutesToTime(occurrence.endMinutes)}`;

  return (
    <button
      type="button"
      onClick={onClick}
      style={style}
      title={`${subjectName} · ${time}${occurrence.room ? ` · ${occurrence.room}` : ""}`}
      className={cn(
        "group relative w-full overflow-hidden rounded-lg border px-2 py-1.5 text-left transition-all duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
        "hover:shadow-lift active:scale-[0.99]",
        color.block,
        occurrence.cancelled && "opacity-70",
        className
      )}
    >
      {/* Liseré latéral coloré — doublon de la pastille (ni couleur seule, ni pastille seule). */}
      <span aria-hidden="true" className={cn("absolute inset-y-0 left-0 w-1", color.accent)} />

      <span className="block pl-1.5">
        <SubjectName name={subjectName} className="text-[12px] leading-tight" />
        <span className="mt-0.5 block truncate text-[10px] font-semibold opacity-80">{time}</span>
        {!compact && occurrence.room && (
          <span className="mt-0.5 flex items-center gap-1 truncate text-[10px] font-medium opacity-70">
            <MapPin size={9} className="shrink-0" />
            <span className="truncate">{occurrence.room}</span>
          </span>
        )}
        {!compact && !occurrence.room && occurrence.teacher && (
          <span className="mt-0.5 block truncate text-[10px] font-medium opacity-70">
            {occurrence.teacher}
          </span>
        )}
        {occurrence.cancelled && (
          <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-foreground/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide">
            <Ban size={8} />
            Annulée
          </span>
        )}
        {!occurrence.cancelled && occurrence.kind !== "normal" && (
          <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-foreground/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide">
            <MoveRight size={8} />
            {occurrence.kind === "room_changed" || occurrence.kind === "moved_room"
              ? "Salle changée"
              : occurrence.kind === "replaced"
              ? "Remplacée"
              : "Déplacée"}
          </span>
        )}
      </span>
    </button>
  );
}

/* ──────────────────────────────────────────────────────────────────
   Ligne de l'agenda journalier (mobile)
   ────────────────────────────────────────────────────────────────── */

export function AgendaRow({
  occurrence,
  subjectName,
  colorKey,
  onClick,
}: {
  occurrence: Occurrence;
  subjectName: string;
  colorKey: string;
  onClick?: () => void;
}) {
  const color = getSubjectColor(colorKey);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-stretch gap-3 rounded-2xl border p-3 text-left transition-all duration-150",
        "active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        color.block,
        occurrence.cancelled && "opacity-70"
      )}
    >
      {/* Heure */}
      <div className="flex w-14 shrink-0 flex-col items-start justify-center border-r border-current/10 pr-2.5">
        <span className="text-sm font-extrabold leading-none tracking-tight">
          {minutesToTime(occurrence.startMinutes)}
        </span>
        <span className="mt-1 text-[10px] font-semibold opacity-70">
          {minutesToTime(occurrence.endMinutes)}
        </span>
      </div>

      {/* Contenu */}
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
        <SubjectName name={subjectName} className="text-[15px] leading-tight" />
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs font-medium opacity-80">
          {occurrence.room && (
            <span className="inline-flex items-center gap-1">
              <MapPin size={11} />
              {occurrence.room}
            </span>
          )}
          {occurrence.teacher && <span className="truncate">{occurrence.teacher}</span>}
        </div>
        {occurrence.cancelled && (
          <span className="inline-flex w-fit items-center gap-1 rounded-full bg-foreground/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
            <Ban size={9} />
            Séance annulée
          </span>
        )}
        {!occurrence.cancelled && occurrence.kind !== "normal" && (
          <span className="inline-flex w-fit items-center gap-1 rounded-full bg-foreground/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
            <MoveRight size={9} />
            {occurrence.kind === "room_changed" || occurrence.kind === "moved_room"
              ? `Salle modifiée${occurrence.room ? ` · ${occurrence.room}` : ""}`
              : occurrence.kind === "replaced"
              ? "Matière remplacée"
              : "Horaires modifiés"}
          </span>
        )}
        {occurrence.note && (
          <span className="text-[11px] italic leading-snug opacity-75">{occurrence.note}</span>
        )}
      </div>

      {/* Pastille matière — la couleur n'est jamais le seul marqueur */}
      <span aria-hidden="true" className={cn("mt-1 h-2.5 w-2.5 shrink-0 self-start rounded-full", color.dot)} />
    </button>
  );
}
