import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ClipboardCheck } from "lucide-react";

import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { RealtimeListSync } from "@/components/RealtimeListSync";
import { EvaluationsView } from "@/components/evaluations/EvaluationsView";
import { ScheduleClassPicker } from "@/components/schedule/ScheduleClassPicker";
import { canManageEvaluations } from "@/lib/business/permissions";
import { getEvaluationsSnapshot } from "@/lib/evaluations/queries";
import { getScheduleSnapshot } from "@/lib/schedule/queries";
import { getZonedNow } from "@/lib/schedule/dates";
import {
  createEvaluationAction,
  updateEvaluationAction,
  getEvaluationEditDataAction,
} from "@/actions/evaluations";
import type { UserRole } from "@/types/database.types";

export const metadata = { title: "Évaluations — ClassPulse" };

export default async function EvaluationsPage({
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
  const manage = classId ? canManageEvaluations(actor, classId) : false;

  if (!classId) {
    return (
      <div className="space-y-8 animate-fade-in">
        <PageHeader
          icon={ClipboardCheck}
          title="Évaluations"
          description="Contrôles, devoirs surveillés et examens de votre classe."
        />
        <EmptyState
          icon={ClipboardCheck}
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

  // Snapshot évaluations + matières (+ emploi du temps pour la détection de
  // conflit côté gestionnaire). Un incident de chargement n'est jamais fatal.
  const { snapshot, error } = await getEvaluationsSnapshot(classId);
  const schedule = manage ? await getScheduleSnapshot(classId) : null;

  return (
    <div className="space-y-6 animate-fade-in">
      <RealtimeListSync
        table="evaluations"
        filter={`class_id=eq.${classId}`}
        events={["INSERT", "UPDATE", "DELETE"]}
      />

      <PageHeader
        icon={ClipboardCheck}
        title="Évaluations"
        description={
          isAdmin
            ? "Consultez et gérez les évaluations de toutes les classes."
            : "Contrôles, devoirs surveillés et examens de votre classe."
        }
        badge={manage ? "Gestion active" : "Lecture seule"}
      >
        {isAdmin && classes.length > 0 && (
          <ScheduleClassPicker classes={classes} activeClassId={classId} />
        )}
      </PageHeader>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-danger/30 bg-danger/8 px-4 py-3 text-sm font-semibold text-danger"
        >
          {error}
        </div>
      )}

      <EvaluationsView
        evaluations={snapshot.evaluations}
        subjects={snapshot.subjects}
        canManage={manage}
        todayYmd={getZonedNow().todayYmd}
        scheduleSessions={schedule?.snapshot.sessions ?? []}
        scheduleExceptions={schedule?.snapshot.exceptions ?? []}
        onCreate={
          manage
            ? async (values) => {
                "use server";
                return createEvaluationAction({
                  classId,
                  subjectId: values.subjectId,
                  title: values.title,
                  type: values.type,
                  description: values.description,
                  date: values.date,
                  startTime: values.startTime,
                  endTime: values.endTime,
                  room: values.room,
                  chapters: values.chapters,
                  publish: values.publish,
                });
              }
            : undefined
        }
        onUpdate={
          manage
            ? async (evaluationId: string, values) => {
                "use server";
                return updateEvaluationAction(evaluationId, {
                  classId,
                  subjectId: values.subjectId,
                  title: values.title,
                  type: values.type,
                  description: values.description,
                  date: values.date,
                  startTime: values.startTime,
                  endTime: values.endTime,
                  room: values.room,
                  chapters: values.chapters,
                  publish: values.publish,
                });
              }
            : undefined
        }
        onLoadEdit={
          manage
            ? async (evaluationId: string) => {
                "use server";
                return getEvaluationEditDataAction(evaluationId);
              }
            : undefined
        }
      />
    </div>
  );
}
