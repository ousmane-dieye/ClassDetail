import Link from "next/link";
import { ClipboardCheck, Clock, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { getSubjectColor } from "@/lib/constants/subjectColors";
import {
  EVALUATION_STATUS_LABELS,
  EVALUATION_TYPE_SHORT_LABELS,
  type EvaluationView,
} from "@/lib/evaluations/constants";
import { formatYmdCompact } from "@/lib/schedule/dates";
import { cn } from "@/lib/utils";

/**
 * Élément de liste d'une évaluation. Présentation chronologique mobile-first :
 * matière (couleur persistée + nom), intitulé, type, date/heure/salle quand
 * connues, et statuts (brouillon / annulée / reportée) jamais portés par la
 * couleur seule. Toute la carte est un lien vers le détail.
 */
export function EvaluationCard({
  evaluation,
  subjectName,
  colorKey,
}: {
  evaluation: EvaluationView;
  subjectName: string;
  colorKey: string;
}) {
  const color = getSubjectColor(colorKey);
  const cancelled = evaluation.status === "CANCELLED";
  const draft = evaluation.status === "DRAFT";
  const hasTime = Boolean(evaluation.startTime);

  return (
    <Link
      href={`/dashboard/evaluations/${evaluation.id}`}
      className="group flex overflow-hidden rounded-2xl border border-border bg-card shadow-card transition-all hover:border-primary/25 hover:shadow-lift"
    >
      {/* Liseré matière (couleur persistée en base — même identité qu'au calendrier) */}
      <span aria-hidden="true" className={cn("w-1.5 shrink-0 self-stretch", color.accent)} />

      <div className="min-w-0 flex-1 space-y-2 p-4">
        {/* Matière + badges */}
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <span aria-hidden="true" className={cn("h-2.5 w-2.5 shrink-0 rounded-full", color.dot)} />
            <span className="truncate text-xs font-bold text-muted-foreground">{subjectName}</span>
          </span>
          <Badge variant="outline" className="shrink-0 text-[10px]">
            {EVALUATION_TYPE_SHORT_LABELS[evaluation.type]}
          </Badge>
          {draft && (
            <Badge variant="neutral" className="shrink-0 text-[10px]">
              {EVALUATION_STATUS_LABELS.DRAFT}
            </Badge>
          )}
          {cancelled && (
            <Badge variant="danger" className="shrink-0 text-[10px]">
              {EVALUATION_STATUS_LABELS.CANCELLED}
            </Badge>
          )}
        </div>

        {/* Intitulé */}
        <p
          className={cn(
            "text-sm font-semibold leading-snug break-words",
            cancelled ? "text-muted-foreground line-through decoration-danger/60" : "text-foreground"
          )}
        >
          {evaluation.title}
        </p>

        {/* Date / heure / salle — uniquement quand renseignées */}
        <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <ClipboardCheck size={12} className="shrink-0" />
            {formatYmdCompact(evaluation.date)}
          </span>
          {hasTime && (
            <span className="inline-flex items-center gap-1.5">
              <Clock size={12} className="shrink-0" />
              {evaluation.startTime}
              {evaluation.endTime ? ` – ${evaluation.endTime}` : ""}
            </span>
          )}
          {evaluation.room && (
            <span className="inline-flex items-center gap-1.5">
              <MapPin size={12} className="shrink-0" />
              {evaluation.room}
            </span>
          )}
        </div>

        {/* Report : l'ancienne date n'est jamais présentée comme valide */}
        {!cancelled && evaluation.rescheduledFrom && (
          <p className="text-[11px] font-semibold text-warning">
            Reportée — ancienne date : {formatYmdCompact(evaluation.rescheduledFrom)}
          </p>
        )}
      </div>
    </Link>
  );
}
