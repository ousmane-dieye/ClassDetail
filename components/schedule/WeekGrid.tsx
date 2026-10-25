"use client";

/**
 * Grille hebdomadaire desktop — axe des heures à gauche, jours en colonnes,
 * blocs positionnés proportionnellement à leur durée, jour actuel surligné,
 * indicateur d'heure courante. Largeur maîtrisée (pas de débordement
 * horizontal de la page) : la grille défile dans son conteneur si besoin.
 */

import { useMemo } from "react";
import type { Occurrence } from "@/lib/schedule/occurrences";
import { computeOverlapLayout } from "@/lib/schedule/occurrences";
import {
  DAY_SHORT_LABELS,
  formatYmdCompact,
  minutesToTime,
  weekDaysYmd,
} from "@/lib/schedule/dates";
import { ColoredScheduleBlock } from "@/components/schedule/scheduleBlocks";
import { cn } from "@/lib/utils";

const HOUR_HEIGHT = 52; // px par heure — lisible même pour des séances de 45 min
const DAY_MIN = 7; // plage affichée par défaut (étendue selon les séances)
const DAY_MAX = 21;

export function WeekGrid({
  weekStartYmd,
  occurrences,
  subjectNames,
  subjectColors,
  todayYmd,
  nowMinutes,
  onOpenOccurrence,
}: {
  weekStartYmd: string;
  occurrences: Occurrence[];
  subjectNames: Record<string, string>;
  subjectColors: Record<string, string>;
  todayYmd: string;
  /** Minutes depuis minuit local ; null si l'indicateur n'est pas pertinent. */
  nowMinutes: number | null;
  onOpenOccurrence: (occurrence: Occurrence) => void;
}) {
  const days = useMemo(() => weekDaysYmd(weekStartYmd), [weekStartYmd]);
  const layout = useMemo(() => computeOverlapLayout(occurrences), [occurrences]);

  // Étendue des heures : englobe les séances, bornée à [DAY_MIN, DAY_MAX].
  const { hourStart, hourEnd } = useMemo(() => {
    let min = DAY_MIN;
    let max = DAY_MAX;
    for (const o of occurrences) {
      min = Math.min(min, Math.floor(o.startMinutes / 60));
      max = Math.max(max, Math.ceil(o.endMinutes / 60));
    }
    return { hourStart: Math.max(0, min), hourEnd: Math.min(24, Math.max(max, min + 8)) };
  }, [occurrences]);

  const hours = Array.from({ length: hourEnd - hourStart }, (_, i) => hourStart + i);
  const gridHeight = (hourEnd - hourStart) * HOUR_HEIGHT;

  const showNowLine = nowMinutes !== null && days.includes(todayYmd);
  const nowTop =
    nowMinutes !== null ? ((nowMinutes - hourStart * 60) / 60) * HOUR_HEIGHT : 0;

  return (
    <div className="hidden overflow-hidden rounded-2xl border border-border bg-card shadow-card lg:block">
      {/* En-tête : jours */}
      <div className="grid grid-cols-[56px_repeat(7,minmax(0,1fr))] border-b border-border bg-muted/30">
        <div className="border-r border-border/60" />
        {days.map((date, i) => {
          const isToday = date === todayYmd;
          return (
            <div
              key={date}
              aria-label={formatYmdCompact(date)}
              className={cn(
                "border-r border-border/60 px-2 py-2.5 text-center last:border-r-0",
                isToday && "bg-primary/8"
              )}
            >
              <p
                className={cn(
                  "text-[10px] font-bold uppercase tracking-[0.12em]",
                  isToday ? "text-primary" : "text-muted-foreground"
                )}
              >
                {DAY_SHORT_LABELS[i]}
              </p>
              <p
                className={cn(
                  "mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold",
                  isToday ? "bg-primary text-primary-foreground" : "text-foreground"
                )}
              >
                {date.slice(8)}
              </p>
            </div>
          );
        })}
      </div>

      {/* Corps : heures + colonnes.
          borné en hauteur : sur fenêtre courte, le corps défile sous l'en-tête
          au lieu d'être rogné par le bas de la fenêtre. */}
      <div className="relative max-h-[calc(100dvh-260px)] min-h-[240px] overflow-auto">
        <div className="grid min-w-[760px] grid-cols-[56px_repeat(7,minmax(0,1fr))]">
          {/* Axe des heures */}
          <div className="relative border-r border-border/60" style={{ height: gridHeight }}>
            {hours.map((h) => (
              <div
                key={h}
                className="absolute inset-x-0 -translate-y-1/2 pr-2 text-right text-[10px] font-semibold text-muted-foreground"
                style={{ top: (h - hourStart) * HOUR_HEIGHT }}
              >
                {minutesToTime(h * 60)}
              </div>
            ))}
          </div>

          {/* Colonnes des jours */}
          {days.map((date) => {
            const isToday = date === todayYmd;
            const dayOccs = occurrences.filter((o) => o.date === date);
            return (
              <div
                key={date}
                className={cn(
                  "relative border-r border-border/60 last:border-r-0",
                  isToday && "bg-primary/[0.03]"
                )}
                style={{ height: gridHeight }}
              >
                {/* Repères horaires */}
                {hours.map((h) => (
                  <div
                    key={h}
                    className="absolute inset-x-0 border-t border-border/40"
                    style={{ top: (h - hourStart) * HOUR_HEIGHT }}
                  />
                ))}

                {/* Blocs */}
                {dayOccs.map((o) => {
                  const pos = layout.get(o.key) ?? { col: 0, cols: 1 };
                  const top = ((o.startMinutes - hourStart * 60) / 60) * HOUR_HEIGHT;
                  const height = Math.max(
                    24,
                    ((o.endMinutes - o.startMinutes) / 60) * HOUR_HEIGHT - 3
                  );
                  const isShort = height < 56;
                  return (
                    <div
                      key={o.key}
                      className="absolute px-[3px]"
                      style={{
                        top,
                        height,
                        left: `calc(${(pos.col / pos.cols) * 100}% )`,
                        width: `calc(${100 / pos.cols}% )`,
                      }}
                    >
                      <ColoredScheduleBlock
                        occurrence={o}
                        subjectName={subjectNames[o.subjectId] ?? "Cours"}
                        colorKey={subjectColors[o.subjectId] ?? "blue"}
                        compact={isShort}
                        onClick={() => onOpenOccurrence(o)}
                        className="h-full"
                      />
                    </div>
                  );
                })}

                {/* Indicateur d'heure courante */}
                {isToday && showNowLine && (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-0 z-10 flex items-center"
                    style={{ top: nowTop }}
                  >
                    <span className="-ml-1 h-2 w-2 rounded-full bg-danger shadow-[0_0_0_3px_hsl(var(--danger)/0.2)]" />
                    <span className="h-[2px] flex-1 bg-danger/80" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
