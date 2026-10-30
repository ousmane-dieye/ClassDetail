"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { toast } from "@/lib/toast";

export interface DeleteActionResponse {
  success?: boolean;
  error?: string;
}

interface ConfirmDeleteButtonProps {
  action: (id: string) => Promise<DeleteActionResponse>;
  resourceId: string;
  resourceName: string;
  resourceLabel: string;
  successMessage?: string;
  buttonTitle?: string;
  className?: string;
  iconSize?: number;
}

// U3 — Confirmation avant suppression destructive. Le dialogue est un vrai
// modal accessible : aria-modal, piège de focus (Tab/Shift+Tab), Échap pour
// fermer, focus restitué au bouton déclencheur, loading + anti double-submit
// pendant l'appel, et affichage de l'erreur serveur en cas d'échec.
export function ConfirmDeleteButton({
  action,
  resourceId,
  resourceName,
  resourceLabel,
  successMessage,
  buttonTitle,
  className,
  iconSize = 14,
}: ConfirmDeleteButtonProps) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const pendingRef = useRef(false);

  const label = buttonTitle ?? `Supprimer ${resourceLabel}`;

  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (pendingRef.current) return;
        e.preventDefault();
        setOpen(false);
        return;
      }
      if (e.key !== "Tab" || !dialogRef.current) return;
      const focusables = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
      );
      if (focusables.length === 0) return;
      const first = focusables[0] as HTMLElement;
      const last = focusables[focusables.length - 1] as HTMLElement;
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
      previousFocus?.focus?.();
    };
  }, [open]);

  const close = () => {
    if (pendingRef.current) return;
    setOpen(false);
    setError(null);
  };

  const handleDelete = async () => {
    if (pendingRef.current) return;
    setPending(true);
    setError(null);
    try {
      const res = await action(resourceId);
      if (res && !res.success) {
        const msg = res.error ?? "Une erreur est survenue lors de la suppression.";
        setError(msg);
        toast.error(msg);
        setPending(false);
        return;
      }
      toast.success(successMessage ?? `${resourceName} a été supprimé(e) avec succès.`);
      setOpen(false);
      setPending(false);
    } catch {
      const msg = "Une erreur est survenue lors de la suppression.";
      setError(msg);
      toast.error(msg);
      setPending(false);
    }
  };

  return (
    <>
      <Button
        ref={triggerRef}
        type="button"
        size="icon"
        variant="danger"
        className={className}
        title={label}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <Trash2 size={iconSize} />
      </Button>

      {open && (
        <ConfirmDeleteDialog
          dialogRef={dialogRef}
          cancelRef={cancelRef}
          resourceLabel={resourceLabel}
          resourceName={resourceName}
          error={error}
          pending={pending}
          onCancel={close}
          onConfirm={() => void handleDelete()}
        />
      )}
    </>
  );
}

interface ConfirmDeleteDialogProps {
  dialogRef?: React.Ref<HTMLDivElement>;
  cancelRef?: React.Ref<HTMLButtonElement>;
  resourceLabel: string;
  resourceName: string;
  error?: string | null;
  pending?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

// Composant présentiel : structure et contenus du modal (testable en SSR).
export function ConfirmDeleteDialog({
  dialogRef,
  cancelRef,
  resourceLabel,
  resourceName,
  error,
  pending = false,
  onCancel,
  onConfirm,
}: ConfirmDeleteDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in"
        aria-hidden="true"
        onClick={() => {
          if (!pending) onCancel();
        }}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-delete-title"
        aria-describedby="confirm-delete-desc"
        className="relative w-full max-w-md animate-scale-in rounded-2xl border border-border bg-card p-5 shadow-float sm:p-6"
      >
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-danger/10 text-danger">
            <AlertTriangle size={22} />
          </div>
          <div className="min-w-0 flex-1 space-y-1.5">
            <h2
              id="confirm-delete-title"
              className="font-display text-lg font-bold tracking-tight text-foreground"
            >
              Supprimer {resourceLabel} ?
            </h2>
            <p id="confirm-delete-desc" className="text-sm leading-relaxed text-muted-foreground">
              Êtes-vous sûr de vouloir supprimer cette ressource ? Cette action est irréversible.
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-sm font-semibold text-foreground break-words">
          « {resourceName} »
        </div>

        {error && (
          <div
            role="alert"
            className="mt-4 flex items-center gap-2.5 rounded-xl border border-danger/30 bg-danger/8 p-3.5 text-sm text-danger animate-fade-in"
          >
            <AlertTriangle size={18} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="mt-6 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
          <Button
            ref={cancelRef}
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={pending}
          >
            Annuler
          </Button>
          <Button type="button" variant="danger" isLoading={pending} onClick={onConfirm}>
            Supprimer
          </Button>
        </div>
      </div>
    </div>
  );
}
