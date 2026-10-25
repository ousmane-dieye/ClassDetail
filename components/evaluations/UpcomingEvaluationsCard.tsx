import Link from "next/link";
import { ClipboardCheck, Clock } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { getSubjectColor } from "@/lib/constants/subjectColors";
import {
  EVALUATION_TYPE_SHORT_LABELS,
} from "@/lib/evaluations/constants";
import { formatYmdCompact } from "@/lib/schedule/dates";
import type { UpcomingEvaluation } from "@/lib/evaluations/queries";

/**
 * Carte « Prochaines évaluations » (dashboards et bandeau emploi du temps).
 *
 * Composant serveur purement présentational : les données sont chargées par
 * l'appelant, ce qui permet de relayer un éventuel incident du module sans
 * jamais bloquer la page d'accueil.
 */
export function UpcomingEvaluationsCard({
  items,
  classId,
  className = "",
}: {
  items: UpcomingEvaluation[];
  classId: string;
  className?: string;
}) {
  return (
    <section
      aria-label="Prochaines évaluations"
      className={`rounded-2xl border border-border bg-card p-4 sm:p-5 ${className}`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <ClipboardCheck aria-hidden size={17} />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-bold">Prochaines évaluations</h2>
            <p className="text-xs text-muted-foreground"> Publiées et à venir </p>
          </div>
        </div>
        <Link
          href="/dashboard/evaluations"
          className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/10"
        >
          Tout voir
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="mt-3">
          <EmptyState
            icon={ClipboardCheck}
            title="Aucune évaluation à venir"
            description="Les évaluations publiées apparaîtront ici."
          />
        </div>
      ) : (
        <ul className="mt-3 space-y-2">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={`/dashboard/evaluations/${item.id}`}
                className="flex items-center gap-3 rounded-xl border border-border/70 bg-background/60 p-3 transition hover:border-primary/40 hover:bg-primary/5"
              >
                <span
                  aria-hidden
                  className={`h-9 w-1.5 shrink-0 rounded-full ${getSubjectColor(item.subjectColorKey).accent}`}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="truncate text-sm font-bold">{item.subjectName}</span>
                    <Badge variant="neutral" className="shrink-0">
                      {EVALUATION_TYPE_SHORT_LABELS[item.type]}
                    </Badge>
                  </span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    <span>{formatYmdCompact(item.date)}</span>
                    {item.startTime ? (
                      <span className="inline-flex items-center gap-1">
                        <Clock aria-hidden size={11} />
                        {item.startTime}
                        {item.endTime ? ` – ${item.endTime}` : ""}
                      </span>
                    ) : (
                      <span>Heure à confirmer</span>
                    )}
                    {item.room && <span>Salle {item.room}</span>}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Link
        href={`/dashboard/evaluations?class=${classId}`}
        className="mt-3 block rounded-xl border border-dashed border-primary/40 bg-primary/5 px-3 py-2 text-center text-xs font-semibold text-primary hover:bg-primary/10"
      >
        Voir toutes les évaluations
      </Link>
    </section>
  );
}
