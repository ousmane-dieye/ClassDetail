"use client";

/**
 * Conteneur interactif de l'emploi du temps.
 * - Desktop (lg+) : grille hebdomadaire.
 * - Mobile/tablette : agenda journalier + strip de jours (expérience native).
 * La bascule se fait selon la largeur RÉELLE de l'écran (CSS), pas selon le
 * type d'appareil. Les données sont chargées côté serveur ; la navigation
 * temporelle est purement locale (expansion des occurrences côté client).
 */

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import {
  CalendarDays,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  addDaysYmd,
  formatWeekRange,
  getZonedNow,
  startOfWeekYmd,
} from "@/lib/schedule/dates";
import { expandWeek, type Occurrence } from "@/lib/schedule/occurrences";
import type { SessionException, SessionRecurrence } from "@/lib/schedule/occurrences";
import { WeekGrid } from "@/components/schedule/WeekGrid";
import { DayAgenda, DayStrip } from "@/components/schedule/DayAgenda";
import { SessionDetailDialog, type ExceptionMode } from "@/components/schedule/SessionDetailDialog";
import { SessionFormDialog, type SessionFormValues } from "@/components/schedule/SessionFormDialog";
import { getSubjectColor } from "@/lib/constants/subjectColors";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

/**
 * Résultat d'une Server Action du module — union strictement identique à
 * `ActionResult` de `actions/schedule.ts` (succès ou erreur), pour rester
 * assignable depuis la page sans conversion.
 */
export type ScheduleActionResult =
  | { success: true; id?: string; notified?: number }
  | { error: string };

export interface ScheduleViewProps {
  sessions: SessionRecurrence[];
  exceptions: SessionException[];
  subjects: Array<{ id: string; name: string; colorKey: string }>;
  canManage: boolean;
  /** Vrai si au moins une séance publiée existe (états vides distincts). */
  hasPublishedSchedule: boolean;
  /**
   * Bandeau « Prochaines évaluations » (composant serveur injecté par la page).
   * Optionnel : l'emploi du temps reste pleinement fonctionnel sans lui.
   */
  upcomingBanner?: React.ReactNode;
  /** Délégué/admin : handlers appelant les Server Actions. */
  onCreate?: (values: SessionFormValues) => Promise<ScheduleActionResult>;
  onUpdate?: (sessionId: string, values: SessionFormValues) => Promise<ScheduleActionResult>;
  onException?: (
    sessionId: string,
    date: string,
    mode: ExceptionMode,
    values: { startTime?: string; endTime?: string; room?: string; note?: string }
  ) => Promise<ScheduleActionResult>;
}

export function ScheduleView({
  sessions,
  exceptions,
  subjects,
  canManage,
  hasPublishedSchedule,
  upcomingBanner,
  onCreate,
  onUpdate,
  onException,
}: ScheduleViewProps) {
  const now = useMemo(() => getZonedNow(), []);
  const [nowMinutes, setNowMinutes] = useState<number | null>(now.minutesOfDay);

  // Rafraîchit l'indicateur d'heure courante toutes les 60 s (montre locale).
  useEffect(() => {
    const id = setInterval(() => {
      setNowMinutes(getZonedNow().minutesOfDay);
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  const todayYmd = now.todayYmd;
  const [weekStart, setWeekStart] = useState(() => startOfWeekYmd(todayYmd));
  const [selectedDay, setSelectedDay] = useState(todayYmd);

  const subjectNames = useMemo(
    () => Object.fromEntries(subjects.map((s) => [s.id, s.name])),
    [subjects]
  );
  const subjectColors = useMemo(
    () => Object.fromEntries(subjects.map((s) => [s.id, s.colorKey])),
    [subjects]
  );

  const weekOccurrences = useMemo(
    () => expandWeek(sessions, exceptions, weekStart, { includeDrafts: canManage }),
    [sessions, exceptions, weekStart, canManage]
  );

  const occurrencesByDate = useMemo(() => {
    const map = new Map<string, Occurrence[]>();
    for (const o of weekOccurrences) {
      const list = map.get(o.date);
      if (list) list.push(o);
      else map.set(o.date, [o]);
    }
    return map;
  }, [weekOccurrences]);

  // ── Navigation temporelle ──
  const moveWeek = useCallback(
    (delta: number) => {
      const target = addDaysYmd(weekStart, delta);
      setWeekStart(target);
      // Le jour sélectionné suit la semaine s'il y appartient encore.
      setSelectedDay((d) => (d >= weekStart && d < addDaysYmd(weekStart, 7) ? addDaysYmd(d, delta) : d));
    },
    [weekStart]
  );
  const goPrevWeek = useCallback(() => moveWeek(-7), [moveWeek]);
  const goNextWeek = useCallback(() => moveWeek(7), [moveWeek]);
  const goToday = useCallback(() => {
    const t = getZonedNow();
    setWeekStart(startOfWeekYmd(t.todayYmd));
    setSelectedDay(t.todayYmd);
    setNowMinutes(t.minutesOfDay);
  }, []);

  const selectDay = useCallback((ymd: string) => {
    setSelectedDay(ymd);
    setWeekStart(startOfWeekYmd(ymd));
  }, []);

  const isCurrentWeek = weekStart === startOfWeekYmd(todayYmd);

  // ── Dialogues ──
  const [detailOccurrence, setDetailOccurrence] = useState<Occurrence | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingSession, setEditingSession] = useState<SessionRecurrence | null>(null);
  const [exceptionPending, startExceptionTransition] = useTransition();
  const [exceptionError, setExceptionError] = useState<string | null>(null);

  const openCreate = () => {
    setEditingSession(null);
    setFormOpen(true);
  };
  const openEdit = (session: SessionRecurrence) => {
    setEditingSession(session);
    setFormOpen(true);
  };

  const handleSubmitForm = async (values: SessionFormValues): Promise<{ error?: string }> => {
    const isEdit = Boolean(editingSession);
    const res: ScheduleActionResult =
      editingSession && onUpdate
        ? await onUpdate(editingSession.id, values)
        : !editingSession && onCreate
          ? await onCreate(values)
          : { error: "Action non disponible." };

    if ("error" in res) {
      toast.error(res.error);
      return { error: res.error };
    }

    toast.success(
      isEdit
        ? "Séance d'emploi du temps mise à jour avec succès."
        : values.publish
          ? "Séance créée et publiée avec succès."
          : "Brouillon de séance enregistré."
    );
    return {};
  };

  const handleException = (
    mode: ExceptionMode,
    values: { startTime?: string; endTime?: string; room?: string; note?: string }
  ) => {
    if (!detailOccurrence || !onException) return;
    setExceptionError(null);
    startExceptionTransition(async () => {
      const res = await onException(detailOccurrence.sessionId, detailOccurrence.date, mode, values);
      if (res && "error" in res && res.error) {
        setExceptionError(res.error);
        toast.error(res.error);
      } else {
        setExceptionError(null);
        setDetailOccurrence(null);
        toast.success(
          mode === "cancel"
            ? "Séance annulée pour cette date."
            : mode === "move"
              ? "Séance déplacée avec succès."
              : "Salle modifiée pour cette séance."
        );
      }
    });
  };

  const detailSubject = detailOccurrence
    ? subjectNames[detailOccurrence.subjectId] ?? "Cours"
    : "";
  const detailColor = detailOccurrence
    ? getSubjectColor(subjectColors[detailOccurrence.subjectId])
    : null;

  // Pré-remplissage du formulaire d'édition.
  const editInitial = editingSession
    ? {
        sessionId: editingSession.id,
        subjectId: editingSession.subjectId,
        dayOfWeek: editingSession.dayOfWeek,
        startTime: editingSession.startTime.slice(0, 5),
        endTime: editingSession.endTime.slice(0, 5),
        room: editingSession.room ?? "",
        teacher: editingSession.teacher ?? "",
        validFrom: editingSession.validFrom,
        validUntil: editingSession.validUntil ?? "",
        publish: editingSession.status === "PUBLISHED",
      }
    : null;

  const draftCount = useMemo(
    () => sessions.filter((s) => s.status === "DRAFT").length,
    [sessions]
  );

  return (
    <div className="space-y-4">
      {/* ── Barre d'outils ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Semaine précédente"
            onClick={goPrevWeek}
          >
            <ChevronLeft size={17} />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Semaine suivante"
            onClick={goNextWeek}
          >
            <ChevronRight size={17} />
          </Button>
          <div className="ml-1">
            <p className="text-sm font-bold leading-tight text-foreground">
              {formatWeekRange(weekStart)}
            </p>
            {!isCurrentWeek && (
              <button
                type="button"
                onClick={goToday}
                className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-bold text-primary transition-colors hover:text-primary/80"
              >
                <CalendarDays size={11} />
                Revenir à aujourd&apos;hui
              </button>
            )}
          </div>
        </div>

        {canManage && onCreate && (
          <Button type="button" size="sm" className="gap-2" onClick={openCreate}>
            <CalendarPlus size={15} />
            Nouvelle séance
            {draftCount > 0 && (
              <span className="ml-1 rounded-full bg-primary-foreground/25 px-1.5 py-0.5 text-[10px] font-bold">
                {draftCount} brouillon{draftCount > 1 ? "s" : ""}
              </span>
            )}
          </Button>
        )}
      </div>

      {/* ── Légende des matières ── */}
      {subjects.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          {subjects.map((s) => {
            const c = getSubjectColor(s.colorKey);
            return (
              <span
                key={s.id}
                className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card/80 px-2.5 py-1 text-xs font-semibold text-foreground shadow-2xs backdrop-blur-xs transition-colors hover:border-border"
              >
                <span aria-hidden="true" className={cn("h-2 w-2 shrink-0 rounded-full", c.dot)} />
                <span className="truncate max-w-[160px]">{s.name}</span>
              </span>
            );
          })}
        </div>
      )}

      {/* ── Bandeau évaluations (facultatif, injecté par la page) ── */}
      {upcomingBanner}

      {/* ── Agenda mobile / tablette (< lg) ── */}
      <div className="space-y-3 lg:hidden">
        <DayStrip
          weekStartYmd={weekStart}
          selectedYmd={selectedDay}
          todayYmd={todayYmd}
          occurrencesByDate={occurrencesByDate}
          onSelect={selectDay}
        />
        <DayAgenda
          selectedYmd={selectedDay}
          occurrences={weekOccurrences}
          subjectNames={subjectNames}
          subjectColors={subjectColors}
          nowMinutes={nowMinutes}
          hasAnySchedule={hasPublishedSchedule}
          onOpenOccurrence={setDetailOccurrence}
        />
      </div>

      {/* ── Grille hebdomadaire desktop (≥ lg) ── */}
      <div className="hidden lg:block">
        <WeekGrid
          weekStartYmd={weekStart}
          occurrences={weekOccurrences}
          subjectNames={subjectNames}
          subjectColors={subjectColors}
          todayYmd={todayYmd}
          nowMinutes={nowMinutes}
          onOpenOccurrence={setDetailOccurrence}
        />
        {!hasPublishedSchedule && weekOccurrences.length === 0 && (
          <div className="mt-4 flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-card/50 px-6 py-10 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-muted text-muted-foreground">
              <CalendarDays size={22} strokeWidth={1.75} />
            </div>
            <div>
              <p className="text-sm font-bold text-foreground">
                {canManage ? "Aucune séance planifiée" : "Emploi du temps non publié"}
              </p>
              <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
                {canManage
                  ? "Créez la première séance pour construire l'emploi du temps de la classe."
                  : "Votre délégué n'a pas encore publié l'emploi du temps de la classe."}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── Dialogue de détails ── */}
      {detailOccurrence && detailColor && (
        <SessionDetailDialog
          occurrence={detailOccurrence}
          subjectName={detailSubject}
          colorKey={subjectColors[detailOccurrence.subjectId] ?? "blue"}
          canManage={canManage && !!onException}
          pending={exceptionPending}
          error={exceptionError}
          onClose={() => {
            setDetailOccurrence(null);
            setExceptionError(null);
          }}
          onEdit={
            canManage && onUpdate
              ? () => {
                  const session = sessions.find((s) => s.id === detailOccurrence.sessionId);
                  setDetailOccurrence(null);
                  if (session) openEdit(session);
                }
              : undefined
          }
          onException={handleException}
        />
      )}

      {/* ── Dialogue de formulaire ── */}
      <SessionFormDialog
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditingSession(null);
        }}
        onSubmit={handleSubmitForm}
        subjects={subjects}
        allSessions={sessions}
        initial={editInitial}
        defaultValidFrom={todayYmd}
        title={editingSession ? "Modifier la séance" : "Nouvelle séance récurrente"}
      />
    </div>
  );
}
