"use client";

/**
 * Conteneur interactif de la liste des évaluations (mobile-first).
 * - Onglets « À venir » (aujourd'hui inclus) / « Passées ».
 * - Filtres matière et type, repliés sur mobile (bouton « Filtres »).
 * - Regroupement par jour avec en-tête (Aujourd'hui / Demain / date longue).
 * - Formulaire de création/édition (délégués & admins) avec avertissements
 *   de conflit renvoyés par le serveur dans un bandeau de résultat.
 */

import { useMemo, useState } from "react";
import { ClipboardCheck, Plus, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { EvaluationCard } from "@/components/evaluations/EvaluationCard";
import {
  EvaluationFormDialog,
  type EvaluationFormValues,
} from "@/components/evaluations/EvaluationFormDialog";
import { EVALUATION_TYPE_LABELS, type EvaluationView } from "@/lib/evaluations/constants";
import {
  filterEvaluations,
  groupEvaluationsByDate,
  partitionEvaluations,
} from "@/lib/evaluations/listing";
import { addDaysYmd, formatYmdLong } from "@/lib/schedule/dates";
import type { SessionException, SessionRecurrence } from "@/lib/schedule/occurrences";
import type { EvaluationType } from "@/types/database.types";
import { EVALUATION_TYPES } from "@/lib/validation/schemas";

export type EvaluationActionResult =
  | { success: true; id?: string; notified?: number; warnings?: string[] }
  | { error: string };

export interface EvaluationsViewProps {
  evaluations: EvaluationView[];
  subjects: Array<{ id: string; name: string; colorKey: string }>;
  canManage: boolean;
  /** Date locale "YYYY-MM-DD" (calculée côté serveur, fuseau de l'application). */
  todayYmd: string;
  /** Données d'emploi du temps pour la pré-détection de conflit (gestionnaires). */
  scheduleSessions?: SessionRecurrence[];
  scheduleExceptions?: SessionException[];
  onCreate?: (values: EvaluationFormValues) => Promise<EvaluationActionResult>;
  onUpdate?: (evaluationId: string, values: EvaluationFormValues) => Promise<EvaluationActionResult>;
  /**
   * Description + chapitres de l'évaluation éditée (la liste n'en transportant
   * pas) — sans cela, une édition depuis la liste écraserait ces champs.
   */
  onLoadEdit?: (
    evaluationId: string
  ) => Promise<{ success: true; description: string; chapters: string[] } | { error: string }>;
}

interface Notice {
  text: string;
  warnings: string[];
}

function dayHeaderLabel(date: string, todayYmd: string): string {
  if (date === todayYmd) return "Aujourd'hui";
  if (date === addDaysYmd(todayYmd, 1)) return "Demain";
  if (date === addDaysYmd(todayYmd, -1)) return "Hier";
  const long = formatYmdLong(date);
  return long.charAt(0).toUpperCase() + long.slice(1);
}

export function EvaluationsView({
  evaluations,
  subjects,
  canManage,
  todayYmd,
  scheduleSessions = [],
  scheduleExceptions = [],
  onCreate,
  onUpdate,
  onLoadEdit,
}: EvaluationsViewProps) {
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const [subjectFilter, setSubjectFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState<EvaluationType | "">("");
  const [showFilters, setShowFilters] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<EvaluationView | null>(null);
  const [editExtra, setEditExtra] = useState<{ description: string; chapters: string[] } | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const subjectNames = useMemo(
    () => Object.fromEntries(subjects.map((s) => [s.id, s.name])),
    [subjects]
  );
  const subjectColors = useMemo(
    () => Object.fromEntries(subjects.map((s) => [s.id, s.colorKey])),
    [subjects]
  );

  const { upcoming, past } = useMemo(
    () => partitionEvaluations(evaluations, todayYmd),
    [evaluations, todayYmd]
  );

  const filteredTab = useMemo(
    () => filterEvaluations(tab === "upcoming" ? upcoming : past, { subjectId: subjectFilter, type: typeFilter }),
    [tab, upcoming, past, subjectFilter, typeFilter]
  );

  const groups = useMemo(() => groupEvaluationsByDate(filteredTab), [filteredTab]);
  const filtersActive = Boolean(subjectFilter || typeFilter);

  const openCreate = () => {
    setEditing(null);
    setEditExtra(null);
    setFormOpen(true);
  };

  /**
   * Édition : la liste ne transporte ni description ni chapitres — on les
   * charge avant d'ouvrir. En cas d'échec, on n'ouvre PAS le formulaire
   * (risque d'écrasement silencieux), on affiche l'erreur.
   */
  const openEdit = async (evaluation: EvaluationView) => {
    if (onLoadEdit) {
      setEditLoading(true);
      const res = await onLoadEdit(evaluation.id);
      setEditLoading(false);
      if ("error" in res) {
        setNotice({ text: res.error, warnings: [] });
        return;
      }
      setEditExtra({ description: res.description, chapters: res.chapters });
    } else {
      setEditExtra(null);
    }
    setEditing(evaluation);
    setFormOpen(true);
  };

  const handleSubmitForm = async (values: EvaluationFormValues): Promise<{ error?: string }> => {
    const res: EvaluationActionResult =
      editing && onUpdate
        ? await onUpdate(editing.id, values)
        : !editing && onCreate
          ? await onCreate(values)
          : { error: "Action non disponible." };
    if ("error" in res) return { error: res.error };
    const warnings = res.warnings ?? [];
    setNotice({
      text: editing
        ? "Évaluation mise à jour."
        : values.publish
          ? "Évaluation créée et publiée. La classe a été notifiée."
          : "Brouillon enregistré. Il est visible uniquement par les délégués et l'administration.",
      warnings,
    });
    return {};
  };

  const editInitial = editing
    ? {
        id: editing.id,
        subjectId: editing.subjectId,
        title: editing.title,
        type: editing.type,
        date: editing.date,
        startTime: editing.startTime ?? "",
        endTime: editing.endTime ?? "",
        room: editing.room ?? "",
        description: editExtra?.description ?? "",
        chapters: editExtra?.chapters ?? [],
        publish: true,
      }
    : null;

  return (
    <div className="space-y-4">
      {/* ── Barre d'outils ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center rounded-xl border border-border bg-card p-0.5" role="tablist" aria-label="Période">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "upcoming"}
            onClick={() => setTab("upcoming")}
            className={`rounded-lg px-3.5 h-9 text-xs font-bold transition-colors ${
              tab === "upcoming" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            À venir
            <span className="ml-1.5 opacity-70">({upcoming.length})</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "past"}
            onClick={() => setTab("past")}
            className={`rounded-lg px-3.5 h-9 text-xs font-bold transition-colors ${
              tab === "past" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Passées
            <span className="ml-1.5 opacity-70">({past.length})</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            aria-expanded={showFilters}
            onClick={() => setShowFilters((v) => !v)}
          >
            <SlidersHorizontal size={14} />
            Filtres
            {filtersActive && (
              <span className="rounded-full bg-primary/15 px-1.5 text-[10px] font-bold text-primary">
                {[subjectFilter, typeFilter].filter(Boolean).length}
              </span>
            )}
          </Button>
          {canManage && onCreate && (
            <Button type="button" size="sm" className="gap-1.5" onClick={openCreate}>
              <Plus size={15} />
              Ajouter
            </Button>
          )}
        </div>
      </div>

      {/* ── Filtres (repliés : jamais encombrants sur mobile) ── */}
      {showFilters && (
        <div className="flex flex-col gap-2.5 rounded-2xl border border-border bg-card p-3.5 sm:flex-row sm:items-end animate-fade-in">
          <div className="flex-1 space-y-1.5">
            <label htmlFor="ev-subject-filter" className="text-xs font-bold text-foreground">
              Matière
            </label>
            <Select
              id="ev-subject-filter"
              aria-label="Filtrer par matière"
              value={subjectFilter}
              onChange={(e) => setSubjectFilter(e.target.value)}
            >
              <option value="">Toutes les matières</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex-1 space-y-1.5">
            <label htmlFor="ev-type-filter" className="text-xs font-bold text-foreground">
              Type
            </label>
            <Select
              id="ev-type-filter"
              aria-label="Filtrer par type"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as EvaluationType | "")}
            >
              <option value="">Tous les types</option>
              {EVALUATION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {EVALUATION_TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
          </div>
          {filtersActive && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="gap-1.5 text-muted-foreground"
              onClick={() => {
                setSubjectFilter("");
                setTypeFilter("");
              }}
            >
              <X size={14} />
              Réinitialiser
            </Button>
          )}
        </div>
      )}

      {/* ── Bandeau de résultat (après enregistrement) ── */}
      {notice && (
        <div className="space-y-2 rounded-2xl border border-border bg-card p-3.5 animate-fade-in" role="status">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-semibold text-foreground">{notice.text}</p>
            <button
              type="button"
              aria-label="Fermer le message"
              onClick={() => setNotice(null)}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X size={15} />
            </button>
          </div>
          {notice.warnings.length > 0 && (
            <div className="space-y-1.5 rounded-xl border border-warning/30 bg-warning/8 px-3.5 py-2.5">
              <p className="text-xs font-bold text-warning">Avertissements</p>
              {notice.warnings.map((w) => (
                <p key={w} className="text-xs leading-relaxed text-warning/90">
                  {w}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Liste par jours ── */}
      {groups.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title={
            filtersActive
              ? "Aucun résultat"
              : tab === "upcoming"
                ? "Aucune évaluation à venir"
                : "Aucune évaluation passée"
          }
          description={
            filtersActive
              ? "Aucune évaluation ne correspond aux filtres sélectionnés."
              : tab === "upcoming"
                ? canManage
                  ? "Créez la première évaluation pour alimenter le planning de la classe."
                  : "Votre délégué n'a pas encore publié d'évaluation pour le moment."
                : "Les évaluations terminées apparaîtront ici."
          }
          action={
            filtersActive ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setSubjectFilter("");
                  setTypeFilter("");
                }}
              >
                Réinitialiser les filtres
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <section key={group.date} aria-label={dayHeaderLabel(group.date, todayYmd)} className="space-y-2.5">
              <div className="flex items-center gap-2.5">
                <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
                  {dayHeaderLabel(group.date, todayYmd)}
                </h2>
                {group.date === todayYmd && (
                  <Badge variant="outline" className="text-[10px]">
                    {group.items.length} évaluation{group.items.length > 1 ? "s" : ""}
                  </Badge>
                )}
                <span className="h-px flex-1 bg-border/60" aria-hidden="true" />
              </div>
              <div className="space-y-2.5">
                {group.items.map((evaluation) => (
                  <div key={evaluation.id} className="relative">
                    <EvaluationCard
                      evaluation={evaluation}
                      subjectName={subjectNames[evaluation.subjectId] ?? "Matière"}
                      colorKey={subjectColors[evaluation.subjectId] ?? "blue"}
                    />
                    {canManage && (
                      <button
                        type="button"
                        disabled={editLoading}
                        onClick={() => void openEdit(evaluation)}
                        className="absolute right-2.5 top-2.5 rounded-lg border border-border bg-background/90 px-2 py-1 text-[11px] font-bold text-muted-foreground shadow-subtle backdrop-blur transition-colors hover:border-primary/30 hover:text-foreground disabled:opacity-60"
                      >
                        {editLoading ? "…" : "Modifier"}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* ── Dialogue de formulaire ── */}
      <EvaluationFormDialog
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        onSubmit={handleSubmitForm}
        subjects={subjects}
        allEvaluations={evaluations}
        scheduleSessions={scheduleSessions}
        scheduleExceptions={scheduleExceptions}
        initial={editInitial}
        defaultDate={todayYmd}
        title={editing ? "Modifier l'évaluation" : "Nouvelle évaluation"}
      />
    </div>
  );
}
