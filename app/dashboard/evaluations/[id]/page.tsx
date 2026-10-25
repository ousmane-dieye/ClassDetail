import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import { ClipboardCheck } from "lucide-react";

import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent } from "@/components/ui/Card";
import { EvaluationManagerPanel } from "@/components/evaluations/EvaluationManagerPanel";
import { canManageEvaluations } from "@/lib/business/permissions";
import {
  getClassResources,
  getEvaluationDetail,
  getEvaluationsSnapshot,
} from "@/lib/evaluations/queries";
import { getScheduleSnapshot } from "@/lib/schedule/queries";
import { getSubjectColor } from "@/lib/constants/subjectColors";
import {
  EVALUATION_STATUS_LABELS,
  EVALUATION_TYPE_LABELS,
} from "@/lib/evaluations/constants";
import { formatYmdLong } from "@/lib/schedule/dates";
import {
  updateEvaluationAction,
  publishEvaluationAction,
  cancelEvaluationAction,
  deleteEvaluationAction,
  setEvaluationResourcesAction,
} from "@/actions/evaluations";
import type { UserRole } from "@/types/database.types";

export const metadata = { title: "Détail de l'évaluation — ClassPulse" };

export default async function EvaluationDetailPage({
  params,
}: {
  params: { id: string };
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

  // Lecture (RLS) : renvoie null si invisible → 404, jamais d'information.
  const { detail, documents, hints } = await getEvaluationDetail(params.id);
  if (!detail) notFound();

  const role = profile.role as UserRole;
  const actor = { id: user.id, role, classId: profile.class_id };
  const manage = canManageEvaluations(actor, detail.classId);

  // Contexte gestionnaire (édition, ressources, conflits).
  const [snapshotResult, resources, schedule] = manage
    ? await Promise.all([
        getEvaluationsSnapshot(detail.classId),
        getClassResources(detail.classId),
        getScheduleSnapshot(detail.classId),
      ])
    : [{ snapshot: { evaluations: [], subjects: [] } }, { documents: [], hints: [] }, null];

  const subjects = snapshotResult.snapshot.subjects;
  const allEvaluations = snapshotResult.snapshot.evaluations;
  const subjectColor = getSubjectColor(detail.subjectColorKey);

  const whenParts = [
    formatYmdLong(detail.date),
    detail.startTime
      ? detail.endTime
        ? `${detail.startTime} – ${detail.endTime}`
        : `à partir de ${detail.startTime}`
      : "heure à confirmer",
  ];
  if (detail.room) whenParts.push(`salle ${detail.room}`);

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        icon={ClipboardCheck}
        title={detail.title}
        description={`${detail.subjectName} · ${EVALUATION_TYPE_LABELS[detail.type]}`}
        badge={EVALUATION_STATUS_LABELS[detail.status]}
      />

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-7">
          <Card hoverEffect={false}>
            <CardContent className="space-y-4 p-5">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-bold ${subjectColor.block}`}
                >
                  {detail.subjectName}
                </span>
                {detail.rescheduledFrom && (
                  <Badge variant="warning">
                    Reportée (anciennement le {formatYmdLong(detail.rescheduledFrom)})
                  </Badge>
                )}
              </div>

              <p className="text-sm font-semibold text-foreground">{whenParts.join(" · ")}</p>

              {detail.description ? (
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                  {detail.description}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">Aucune description.</p>
              )}

              <div>
                <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
                  Chapitres concernés
                </h2>
                {detail.chapters.length === 0 ? (
                  <p className="mt-1.5 text-sm text-muted-foreground">
                    Aucun chapitre renseigné.
                  </p>
                ) : (
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {detail.chapters.map((chapter) => (
                      <li
                        key={chapter}
                        className="rounded-lg border border-border bg-muted/40 px-2.5 py-1 text-xs font-semibold text-foreground"
                      >
                        {chapter}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {detail.status === "CANCELLED" && (
                <div
                  role="alert"
                  className="rounded-xl border border-danger/30 bg-danger/8 px-4 py-3 text-sm font-semibold text-danger"
                >
                  Évaluation annulée
                  {detail.cancellationNote ? ` — motif : ${detail.cancellationNote}` : "."}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Ressources de révision liées (facultatives). */}
          <Card hoverEffect={false}>
            <CardContent className="space-y-3 p-5">
              <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
                Ressources de révision
              </h2>
              {documents.length === 0 && hints.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Aucune ressource associée pour le moment.
                </p>
              ) : (
                <ul className="space-y-2">
                  {documents.map((doc) => (
                    <li key={`doc-${doc.id}`}>
                      <a
                        href={doc.driveUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block rounded-xl border border-border/70 bg-background/60 px-3 py-2 text-sm font-semibold text-foreground transition hover:border-primary/40 hover:bg-primary/5"
                      >
                        📄 {doc.title}
                      </a>
                    </li>
                  ))}
                  {hints.map((hint) => (
                    <li key={`hint-${hint.id}`}>
                      <a
                        href={hint.driveUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block rounded-xl border border-border/70 bg-background/60 px-3 py-2 text-sm font-semibold text-foreground transition hover:border-primary/40 hover:bg-primary/5"
                      >
                        💡 {hint.title} {hint.year && `· ${hint.year}`}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-5">
          {manage ? (
            <EvaluationManagerPanel
              evaluation={{
                id: detail.id,
                classId: detail.classId,
                subjectId: detail.subjectId,
                title: detail.title,
                type: detail.type,
                date: detail.date,
                startTime: detail.startTime,
                endTime: detail.endTime,
                room: detail.room,
                description: detail.description,
                chapters: detail.chapters,
                status: detail.status,
              }}
              subjects={subjects}
              allEvaluations={allEvaluations}
              scheduleSessions={schedule?.snapshot.sessions ?? []}
              scheduleExceptions={schedule?.snapshot.exceptions ?? []}
              documents={resources.documents}
              hints={resources.hints}
              linkedDocumentIds={documents.map((d) => d.id)}
              linkedHintIds={hints.map((h) => h.id)}
              onUpdate={async (evaluationId, values) => {
                "use server";
                return updateEvaluationAction(evaluationId, {
                  classId: detail.classId,
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
              }}
              onPublish={async (evaluationId) => {
                "use server";
                return publishEvaluationAction(evaluationId);
              }}
              onCancel={async (evaluationId, reason) => {
                "use server";
                return cancelEvaluationAction(evaluationId, reason);
              }}
              onDelete={async (evaluationId) => {
                "use server";
                return deleteEvaluationAction(evaluationId);
              }}
              onSetResources={async (documentIds, hintIds) => {
                "use server";
                return setEvaluationResourcesAction({
                  evaluationId: detail.id,
                  documentIds,
                  hintIds,
                });
              }}
            />
          ) : (
            <Card hoverEffect={false}>
              <CardContent className="p-5">
                <p className="text-sm text-muted-foreground">
                  Cette évaluation est visible par votre classe. Les détails de
                  gestion sont réservés aux délégués et administrateurs.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
