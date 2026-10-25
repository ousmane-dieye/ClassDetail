import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { ArrowRight, CalendarDays, CalendarOff, MapPin } from "lucide-react";
import { Card, CardContent } from "@/components/ui/Card";
import { getScheduleSnapshot } from "@/lib/schedule/queries";
import {
  expandDay,
  ongoingOccurrences,
  type Occurrence,
} from "@/lib/schedule/occurrences";
import { getZonedNow, minutesToTime } from "@/lib/schedule/dates";
import { getSubjectColor } from "@/lib/constants/subjectColors";
import { cn } from "@/lib/utils";

/**
 * Carte « Aujourd'hui » (dashboard étudiant/délégué).
 * Server Component : les données sont calculées côté serveur dans le fuseau
 * de l'application (Africa/Dakar), aucune dépendance au fuseau du navigateur.
 * Trois états distincts : pas de classe / aucun emploi du temps publié /
 * aucun cours aujourd'hui / prochain cours + reste de la journée.
 */
export async function TodayScheduleCard({ classId }: { classId: string | null }) {
  if (!classId) {
    return (
      <Card hoverEffect={false} className="p-5">
        <CardContent className="p-0">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-info/10 text-info">
              <CalendarDays size={15} />
            </div>
            <h2 className="font-display text-sm font-bold uppercase tracking-[0.12em] text-muted-foreground">
              Aujourd&apos;hui
            </h2>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            Aucune classe assignée à votre profil.
          </p>
        </CardContent>
      </Card>
    );
  }

  const { snapshot } = await getScheduleSnapshot(classId);
  const hasPublished = snapshot.sessions.some((s) => s.status === "PUBLISHED");

  const now = getZonedNow();
  const todayOccurrences: Occurrence[] = expandDay(
    snapshot.sessions,
    snapshot.exceptions,
    now.todayYmd,
    { includeDrafts: false }
  ).filter((o) => !o.cancelled);

  const subjectNames = Object.fromEntries(snapshot.subjects.map((s) => [s.id, s.name]));
  const subjectColors = Object.fromEntries(snapshot.subjects.map((s) => [s.id, s.colorKey]));

  const ongoing = ongoingOccurrences(todayOccurrences, now.todayYmd, now.minutesOfDay);
  const next = todayOccurrences.find(
    (o) => o.startMinutes > now.minutesOfDay && o.endMinutes > now.minutesOfDay
  );
  const remaining = todayOccurrences.filter((o) => o.endMinutes > now.minutesOfDay).length;

  const focus: Occurrence | null = ongoing[0] ?? next ?? null;
  const focusColor = focus ? getSubjectColor(subjectColors[focus.subjectId]) : null;

  return (
    <Card hoverEffect={false} className="p-5">
      <CardContent className="p-0">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-sm font-bold uppercase tracking-[0.12em] text-muted-foreground">
            Aujourd&apos;hui
          </h2>
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-info/10 text-info">
            <CalendarDays size={15} />
          </span>
        </div>

        {!hasPublished ? (
          /* ── État : aucun emploi du temps publié ── */
          <div className="mt-4 flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
              <CalendarOff size={19} strokeWidth={1.75} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-foreground">Emploi du temps non publié</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                Votre délégué n&apos;a pas encore publié le planning de la classe.
              </p>
            </div>
          </div>
        ) : todayOccurrences.length === 0 ? (
          /* ── État : planning publié, mais aucun cours aujourd'hui ── */
          <div className="mt-4 flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-success/10 text-success">
              <CalendarDays size={19} strokeWidth={1.75} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-foreground">Aucun cours aujourd&apos;hui</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                Journée libre — parfaite pour réviser ou avancer sur vos projets.
              </p>
            </div>
          </div>
        ) : (
          /* ── État : cours en cours ou prochain cours ── */
          <div className="mt-4 space-y-3">
            <div
              className={cn(
                "relative overflow-hidden rounded-xl border p-3.5 pl-4",
                focusColor?.block
              )}
            >
              <span
                aria-hidden="true"
                className={cn("absolute inset-y-0 left-0 w-1", focusColor?.accent)}
              />
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-[11px] font-bold uppercase tracking-wide opacity-75">
                  {ongoing.length > 0 ? "En cours" : "Prochain cours"}
                </p>
                {remaining > 1 && (
                  <span className="shrink-0 rounded-full bg-foreground/10 px-2 py-0.5 text-[10px] font-bold">
                    +{remaining - (ongoing.length > 0 ? 1 : 0)} plus tard
                  </span>
                )}
              </div>
              <p className="mt-1 truncate text-base font-extrabold leading-tight">
                {focus ? subjectNames[focus.subjectId] ?? "Cours" : ""}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold opacity-85">
                {focus && (
                  <span>
                    {minutesToTime(focus.startMinutes)} – {minutesToTime(focus.endMinutes)}
                  </span>
                )}
                {focus?.room && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin size={11} />
                    {focus.room}
                  </span>
                )}
              </div>
              {focus?.teacher && (
                <p className="mt-1 truncate text-xs opacity-75">{focus.teacher}</p>
              )}
            </div>

            {next && ongoing.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Ensuite : <span className="font-semibold text-foreground">{subjectNames[next.subjectId] ?? "Cours"}</span>{" "}
                à {minutesToTime(next.startMinutes)}
              </p>
            )}
          </div>
        )}

        <Link
          href="/dashboard/schedule"
          className="group mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary transition-colors hover:text-primary/80"
        >
          Voir l&apos;emploi du temps
          <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
        </Link>
      </CardContent>
    </Card>
  );
}
