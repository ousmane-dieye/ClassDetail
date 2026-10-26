import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { RealtimeListSync } from "@/components/RealtimeListSync";
import { ScheduleView } from "@/components/schedule/ScheduleView";
import { ScheduleClassPicker } from "@/components/schedule/ScheduleClassPicker";
import { UpcomingEvaluationsCard } from "@/components/evaluations/UpcomingEvaluationsCard";
import { getScheduleSnapshot } from "@/lib/schedule/queries";
import { getUpcomingEvaluationsForClass } from "@/lib/evaluations/queries";
import { canManageSchedule } from "@/lib/business/permissions";
import {
  createScheduleSessionAction,
  updateScheduleSessionAction,
  upsertScheduleExceptionAction,
} from "@/actions/schedule";
import type { UserRole } from "@/types/database.types";

export const metadata = { title: "Emploi du temps — ClassPulse" };
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: { class?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, class_id")
    .eq("id", user.id)
    .single();
  if (!profile) redirect("/login");

  const role = profile.role as UserRole;
  const isAdmin = role === "ADMIN";

  // Classe active : imposée pour délégué/étudiant, choisie pour l'admin.
  let classId = profile.class_id ?? "";
  let classes: Array<{ id: string; name: string; level: string }> = [];

  if (isAdmin) {
    const { data: allClasses } = await supabase
      .from("classes")
      .select("id, name, level")
      .order("name");
    classes = allClasses ?? [];
    const requested = searchParams.class;
    classId =
      (requested && classes.some((c) => c.id === requested) ? requested : "") ||
      classes[0]?.id ||
      "";
  }

  const actor = { id: user.id, role, classId: profile.class_id };
  const manage = classId ? canManageSchedule(actor, classId) : false;

  if (!classId) {
    return (
      <div className="space-y-8 animate-fade-in">
        <PageHeader
          icon={CalendarDays}
          title="Emploi du temps"
          description="Planning hebdomadaire des cours de votre classe."
        />
        <EmptyState
          icon={CalendarDays}
          title="Aucune classe assignée"
          description={
            isAdmin
              ? "Aucune classe disponible dans l'établissement. Créez d'abord une classe."
              : "Votre profil n'est pas encore rattaché à une classe. Contactez un administrateur."
          }
        />
      </div>
    );
  }

  // Snapshot complet (exceptions incluses, sans borne basse).
  const { snapshot, error } = await getScheduleSnapshot(classId);
  // Bandeau facultatif : évaluations publiées à venir (module évaluations).
  // En cas d'incident sur ce module, l'emploi du temps reste entier.
  const upcomingEvaluations = await getUpcomingEvaluationsForClass(classId, 4);

  return (
    <div className="space-y-6 animate-fade-in">
      <RealtimeListSync
        table="schedule_sessions"
        filter={`class_id=eq.${classId}`}
        events={["INSERT", "UPDATE", "DELETE"]}
      />
      <RealtimeListSync
        table="schedule_session_exceptions"
        filter={`class_id=eq.${classId}`}
        events={["INSERT", "UPDATE", "DELETE"]}
      />

      <PageHeader
        icon={CalendarDays}
        title="Emploi du temps"
        description={
          isAdmin
            ? "Consultez et gérez les emplois du temps de toutes les classes."
            : "Consultez le planning hebdomadaire de votre classe."
        }
        badge={manage ? "Gestion active" : "Lecture seule"}
      >
        {isAdmin && classes.length > 0 && <ScheduleClassPicker classes={classes} activeClassId={classId} />}
      </PageHeader>

      {error && (
        <div role="alert" className="rounded-xl border border-danger/30 bg-danger/8 px-4 py-3 text-sm font-semibold text-danger">
          {error}
        </div>
      )}

      <ScheduleView
        sessions={snapshot.sessions}
        exceptions={snapshot.exceptions}
        subjects={snapshot.subjects}
        canManage={manage}
        hasPublishedSchedule={snapshot.sessions.some((s) => s.status === "PUBLISHED")}
        upcomingBanner={
          upcomingEvaluations.length > 0 ? (
            <UpcomingEvaluationsCard items={upcomingEvaluations} classId={classId} className="mb-1" />
          ) : undefined
        }
        onCreate={
          manage
            ? async (values) => {
                "use server";
                return createScheduleSessionAction({
                  classId,
                  subjectId: values.subjectId,
                  dayOfWeek: values.dayOfWeek,
                  startTime: values.startTime,
                  endTime: values.endTime,
                  room: values.room,
                  teacher: values.teacher,
                  validFrom: values.validFrom,
                  validUntil: values.validUntil,
                  publish: values.publish,
                });
              }
            : undefined
        }
        onUpdate={
          manage
            ? async (sessionId: string, values) => {
                "use server";
                return updateScheduleSessionAction(sessionId, {
                  classId,
                  subjectId: values.subjectId,
                  dayOfWeek: values.dayOfWeek,
                  startTime: values.startTime,
                  endTime: values.endTime,
                  room: values.room,
                  teacher: values.teacher,
                  validFrom: values.validFrom,
                  validUntil: values.validUntil,
                  publish: values.publish,
                });
              }
            : undefined
        }
        onException={
          manage
            ? async (
                sessionId: string,
                date: string,
                mode: "cancel" | "move" | "room",
                values: { startTime?: string; endTime?: string; room?: string; note?: string }
              ) => {
                "use server";
                return upsertScheduleExceptionAction({
                  sessionId,
                  date,
                  mode,
                  startTime: values.startTime ?? "",
                  endTime: values.endTime ?? "",
                  room: values.room ?? "",
                  note: values.note ?? "",
                });
              }
            : undefined
        }
      />

      {/* Légende fuseau — information, jamais un fuseau calculé côté client. */}
      <p className="text-center text-[11px] text-muted-foreground">
        Tous les horaires sont exprimés dans le fuseau de l&apos;application (Africa/Dakar).
      </p>
    </div>
  );
}
