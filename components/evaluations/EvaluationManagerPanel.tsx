"use client";

/**
 * Actions de gestion d'une évaluation (délégués & admins) sur la page de
 * détail : édition, publication, annulation tracée (motif facultatif),
 * ressources de révision, suppression (confirmée). Feedback en ligne,
 * erreurs serveur affichées — jamais d'action décorative.
 */

import { useEffect, useRef, useState } from "react";
import { Ban, BookOpen, Pencil, Send } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { ConfirmDeleteButton } from "@/components/ConfirmDeleteButton";
import { EvaluationFormDialog, type EvaluationFormValues } from "@/components/evaluations/EvaluationFormDialog";
import { EvaluationResourcesDialog } from "@/components/evaluations/EvaluationResourcesDialog";
import type { ClassResourceDocument, ClassResourceHint } from "@/lib/evaluations/queries";
import type { EvaluationView } from "@/lib/evaluations/constants";
import type { SessionException, SessionRecurrence } from "@/lib/schedule/occurrences";
import type { EvaluationStatus, EvaluationType } from "@/types/database.types";

export type ManagerActionResult = { success: true; notified?: number; warnings?: string[] } | { error: string };

export interface ManagedEvaluation {
  id: string;
  classId: string;
  subjectId: string;
  title: string;
  type: EvaluationType;
  date: string;
  startTime: string | null;
  endTime: string | null;
  room: string | null;
  description: string | null;
  chapters: string[];
  status: EvaluationStatus;
}

export interface EvaluationManagerPanelProps {
  evaluation: ManagedEvaluation;
  subjects: Array<{ id: string; name: string; colorKey: string }>;
  allEvaluations: EvaluationView[];
  scheduleSessions: SessionRecurrence[];
  scheduleExceptions: SessionException[];
  documents: ClassResourceDocument[];
  hints: ClassResourceHint[];
  linkedDocumentIds: string[];
  linkedHintIds: string[];
  onUpdate: (evaluationId: string, values: EvaluationFormValues) => Promise<ManagerActionResult>;
  onPublish: (evaluationId: string) => Promise<ManagerActionResult>;
  onCancel: (evaluationId: string, reason: string) => Promise<ManagerActionResult>;
  onDelete: (evaluationId: string) => Promise<ManagerActionResult>;
  onSetResources: (documentIds: string[], hintIds: string[]) => Promise<ManagerActionResult>;
}

export function EvaluationManagerPanel({
  evaluation,
  subjects,
  allEvaluations,
  scheduleSessions,
  scheduleExceptions,
  documents,
  hints,
  linkedDocumentIds,
  linkedHintIds,
  onUpdate,
  onPublish,
  onCancel,
  onDelete,
  onSetResources,
}: EvaluationManagerPanelProps) {
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; text: string; warnings?: string[] } | null>(null);
  const [pending, setPending] = useState<"publish" | "cancel" | null>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [resourcesOpen, setResourcesOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  // Dialogue d'annulation : focus trap + Échap + focus restitué (convention
  // des dialogues du projet, identique aux formulaires).
  const cancelDialogRef = useRef<HTMLDivElement>(null);
  const cancelTriggerRef = useRef<HTMLElement | null>(null);
  const pendingRef = useRef(pending);
  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);
  useEffect(() => {
    if (!cancelOpen) return;
    cancelTriggerRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cancelDialogRef.current?.querySelector<HTMLElement>("textarea, button")?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (pendingRef.current !== "cancel") setCancelOpen(false);
        return;
      }
      if (e.key !== "Tab" || !cancelDialogRef.current) return;
      const focusables = Array.from(
        cancelDialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), textarea, input, select, a[href], [tabindex]:not([tabindex="-1"])'
        )
      );
      if (focusables.length === 0) return;
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      cancelTriggerRef.current?.focus?.();
    };
  }, [cancelOpen]);

  const showFeedback = (res: ManagerActionResult, successText: string) => {
    if ("error" in res) {
      setFeedback({ kind: "error", text: res.error });
      return false;
    }
    setFeedback({ kind: "success", text: successText, warnings: res.warnings ?? [] });
    return true;
  };

  const handleEdit = async (values: EvaluationFormValues) => {
    const res = await onUpdate(evaluation.id, values);
    if ("error" in res) return { error: res.error };
    showFeedback(res, "Évaluation mise à jour.");
    return {};
  };

  const handlePublish = async () => {
    setPending("publish");
    const res = await onPublish(evaluation.id);
    setPending(null);
    showFeedback(res, "Évaluation publiée. La classe a été notifiée.");
  };

  const handleCancel = async () => {
    setPending("cancel");
    const res = await onCancel(evaluation.id, cancelReason);
    setPending(null);
    if (showFeedback(res, "Évaluation annulée. La classe a été notifiée.")) {
      setCancelOpen(false);
      setCancelReason("");
    }
  };

  const handleResources = async (documentIds: string[], hintIds: string[]) => {
    const res = await onSetResources(documentIds, hintIds);
    if ("error" in res) return { error: res.error };
    setFeedback({ kind: "success", text: "Ressources de révision mises à jour." });
    return {};
  };

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">Gestion</h2>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setEditOpen(true)}>
          <Pencil size={14} />
          Modifier
        </Button>
        <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setResourcesOpen(true)}>
          <BookOpen size={14} />
          Ressources
        </Button>
        {evaluation.status === "DRAFT" && (
          <Button
            type="button"
            size="sm"
            className="gap-1.5"
            isLoading={pending === "publish"}
            onClick={() => void handlePublish()}
          >
            <Send size={14} />
            Publier
          </Button>
        )}
        {evaluation.status === "PUBLISHED" && (
          <Button
            type="button"
            variant="danger"
            size="sm"
            className="gap-1.5"
            onClick={() => setCancelOpen(true)}
          >
            <Ban size={14} />
            Annuler
          </Button>
        )}
        <ConfirmDeleteButton
          action={async () => {
            const res = await onDelete(evaluation.id);
            if ("error" in res) return { success: false, error: res.error };
            return { success: true };
          }}
          resourceId={evaluation.id}
          resourceName={evaluation.title}
          resourceLabel="l'évaluation"
          buttonTitle="Supprimer l'évaluation"
          className="h-8 w-8 rounded-lg"
        />
      </div>

      {feedback && (
        <div
          role={feedback.kind === "error" ? "alert" : "status"}
          className={`space-y-1.5 rounded-xl border px-3.5 py-2.5 text-xs font-semibold animate-fade-in ${
            feedback.kind === "error"
              ? "border-danger/30 bg-danger/8 text-danger"
              : "border-border bg-muted/40 text-foreground"
          }`}
        >
          <p>{feedback.text}</p>
          {feedback.warnings && feedback.warnings.length > 0 && (
            <div className="space-y-1 rounded-lg border border-warning/30 bg-warning/8 px-3 py-2 text-warning">
              <p className="font-bold">Avertissements</p>
              {feedback.warnings.map((w) => (
                <p key={w} className="font-normal leading-relaxed">
                  {w}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Édition (données complètes déjà chargées par la page serveur) */}
      <EvaluationFormDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onSubmit={handleEdit}
        subjects={subjects}
        allEvaluations={allEvaluations}
        scheduleSessions={scheduleSessions}
        scheduleExceptions={scheduleExceptions}
        initial={{
          id: evaluation.id,
          subjectId: evaluation.subjectId,
          title: evaluation.title,
          type: evaluation.type,
          date: evaluation.date,
          startTime: evaluation.startTime ?? "",
          endTime: evaluation.endTime ?? "",
          room: evaluation.room ?? "",
          description: evaluation.description ?? "",
          chapters: evaluation.chapters,
          publish: true,
        }}
        defaultDate={evaluation.date}
        title="Modifier l'évaluation"
      />

      {/* Ressources de révision (facultatives) */}
      <EvaluationResourcesDialog
        open={resourcesOpen}
        onClose={() => setResourcesOpen(false)}
        onSubmit={handleResources}
        documents={documents}
        hints={hints}
        subjects={subjects}
        initialDocumentIds={linkedDocumentIds}
        initialHintIds={linkedHintIds}
      />

      {/* Annulation tracée (motif facultatif) */}
      {cancelOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in"
            aria-hidden="true"
            onClick={() => {
              if (pending !== "cancel") setCancelOpen(false);
            }}
          />
          <div
            ref={cancelDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="cancel-evaluation-title"
            className="relative w-full max-w-md animate-scale-in rounded-2xl border border-border bg-card p-5 shadow-float sm:p-6"
          >
            <h2 id="cancel-evaluation-title" className="font-display text-lg font-bold tracking-tight text-foreground">
              Annuler cette évaluation ?
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              L&apos;évaluation restera visible avec le statut « Annulée » et la classe sera
              notifiée. Vous pouvez indiquer un motif (facultatif).
            </p>
            <div className="mt-4 space-y-1.5">
              <label htmlFor="cancel-evaluation-reason" className="text-xs font-bold text-foreground">
                Motif (facultatif)
              </label>
              <Textarea
                id="cancel-evaluation-reason"
                maxLength={300}
                value={cancelReason}
                placeholder="Ex : reporté à une date ultérieure"
                onChange={(e) => setCancelReason(e.target.value)}
              />
            </div>
            <div className="mt-6 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                disabled={pending === "cancel"}
                onClick={() => setCancelOpen(false)}
              >
                Retour
              </Button>
              <Button type="button" variant="danger" isLoading={pending === "cancel"} onClick={() => void handleCancel()}>
                Annuler l&apos;évaluation
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
