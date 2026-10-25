import { ClipboardCheck } from "lucide-react";

import { PageHeader } from "@/components/PageHeader";

export default function EvaluationsLoading() {
  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        icon={ClipboardCheck}
        title="Évaluations"
        description="Chargement des évaluations de la classe…"
      />
      <div className="space-y-3" aria-busy="true" aria-live="polite">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl border border-border bg-card" />
        ))}
      </div>
      <span className="sr-only">Chargement des évaluations…</span>
    </div>
  );
}
