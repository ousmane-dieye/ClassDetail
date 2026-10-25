"use client";

/**
 * Agenda journalier mobile — expérience « calendrier natif » :
 * strip de jours compact, liste chronologique, repère « en cours »,
 * états vides soignés, cibles tactiles ≥ 44px.
 */

import { useMemo } from "react";
import type { Occurrence } from "@/lib/schedule/occurrences";
import { ongoingOccurrences } from "@/lib/schedule/occurrences";
import {
  DAY_MIN_LABELS,
  dayNumber,
  formatYmdLong,
  minutesToTime,
  weekDaysYmd,
} from "@/lib/schedule/dates";
import { AgendaRow } from "@/components/schedule/scheduleBlocks";
import { CalendarOff, CalendarX2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function DayStrip({
  weekStartYmd,
  selectedYmd,
  todayYmd,
  occurrencesByDate,
  onSelect,
}: {
  weekStartYmd: string;
  selectedYmd: string;
  todayYmd: string;
  occurrencesByDate: Map<string, Occurrence[]>;
  onSelect: (ymd: string) => void;
}) {
  const days = useMemo(() => weekDaysYmd(weekStartYmd), [weekStartYmd]);

  return (
    <div
      role="tablist"
      aria-label="Choisir un jour"
      className="flex gap-1.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {days.map((date, i) => {
        const isSelected = date === selectedYmd;
        const isToday = date === todayYmd;
        const hasCourses = (occurrencesByDate.get(date) ?? []).some((o) => !o.cancelled);
        const count = (occurrencesByDate.get(date) ?? []).filter((o) => !o.cancelled).length;

        return (
          <button
            key={date}
            role="tab"
            aria-selected={isSelected}
            aria-label={`${formatYmdLong(date)}${hasCourses ? `, ${count} cours` : ", aucun cours"}`}
            onClick={() => onSelect(date)}
            className={cn(
              "flex min-w-[46px] flex-1 shrink-0 flex-col items-center gap-0.5 rounded-2xl border px-1.5 py-2 transition-all duration-150 active:scale-95",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              isSelected
                ? "border-primary bg-primary text-primary-foreground shadow-subtle"
                : isToday
                ? "border-primary/30 bg-primary/5 text-foreground"
                : "border-border/70 bg-card text-foreground"
            )}
          >
            <span
              className={cn(
                "text-[10px] font-bold uppercase tracking-wide",
                isSelected ? "text-primary-foreground/80" : "text-muted-foreground"
              )}
            >
              {DAY_MIN_LABELS[i]}
            </span>
            <span
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full text-sm font-extrabold",
                isSelected && "bg-primary-foreground/20"
              )}
            >
              {dayNumber(date)}
            </span>
            {/* Pastille : présence de cours (info non-portée par la seule couleur) */}
            <span
              aria-hidden="true"
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                hasCourses
                  ? isSelected
                    ? "bg-primary-foreground"
                    : "bg-primary"
                  : "bg-transparent"
              )}
            />
          </button>
        );
      })}
    </div>
  );
}

export function DayAgenda({
  selectedYmd,
  occurrences,
  subjectNames,
  subjectColors,
  nowMinutes,
  hasAnySchedule,
  onOpenOccurrence,
}: {
  selectedYmd: string;
  occurrences: Occurrence[];
  subjectNames: Record<string, string>;
  subjectColors: Record<string, string>;
  nowMinutes: number | null;
  /** Vrai si la classe a au moins une séance publiée (état vide distinct). */
  hasAnySchedule: boolean;
  onOpenOccurrence: (occurrence: Occurrence) => void;
}) {
  const dayOccs = useMemo(
    () => occurrences.filter((o) => o.date === selectedYmd),
    [occurrences, selectedYmd]
  );
  const ongoing = useMemo(
    () =>
      nowMinutes !== null
        ? new Set(
            ongoingOccurrences(dayOccs, selectedYmd, nowMinutes).map((o) => o.key)
          )
        : new Set<string>(),
    [dayOccs, selectedYmd, nowMinutes]
  );

  return (
    <section aria-label={`Cours du ${selectedYmd}`} className="space-y-2.5">
      <h2 className="px-1 text-sm font-bold capitalize text-foreground">
        {formatYmdLong(selectedYmd)}
      </h2>

      {dayOccs.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-card/50 px-6 py-10 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-muted text-muted-foreground">
            {hasAnySchedule ? <CalendarX2 size={22} strokeWidth={1.75} /> : <CalendarOff size={22} strokeWidth={1.75} />}
          </div>
          <div>
            <p className="text-sm font-bold text-foreground">
              {hasAnySchedule ? "Aucun cours ce jour-là" : "Emploi du temps non publié"}
            </p>
            <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">
              {hasAnySchedule
                ? "Profitez-en pour réviser ou avancer sur vos projets."
                : "Votre délégué n'a pas encore publié l'emploi du temps de la classe."}
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-2.5">
          {dayOccs.map((o) => (
            <div key={o.key} className="relative">
              {ongoing.has(o.key) && (
                <span className="absolute -left-1 top-3 z-10 h-2.5 w-2.5 rounded-full bg-danger ring-2 ring-background" />
              )}
              <AgendaRow
                occurrence={o}
                subjectName={subjectNames[o.subjectId] ?? "Cours"}
                colorKey={subjectColors[o.subjectId] ?? "blue"}
                onClick={() => onOpenOccurrence(o)}
              />
            </div>
          ))}
          {nowMinutes !== null && ongoing.size > 0 && (
            <p className="px-1 pt-1 text-[11px] font-semibold text-danger">
              ● En cours à {minutesToTime(nowMinutes)}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
