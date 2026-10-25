"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeftRight,
  CheckCircle2,
  Clock,
  GraduationCap,
  Info,
  LogIn,
  ShieldAlert,
  UserRoundX,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";
import {
  cancelClassRequestAction,
  leaveClassAction,
  requestClassTransferAction,
} from "@/actions/membership";
import {
  registrationStatusLabel,
  type ClassOption,
  type MembershipActionResult,
  type MembershipRequestSnapshot,
  type MembershipView,
} from "@/lib/business/membership";

/* ──────────────────────────────────────────────────────────────────
   Dashboard → Paramètres → Ma classe
   Toutes les actions appellent les Server Actions de
   `actions/membership.ts` (identité relevée côté serveur, transitions
   atomiques dans la base — migration 0019). Aucun état n'est annoncé
   comme réussi avant la réponse du serveur.
   ────────────────────────────────────────────────────────────────── */

type Notice = { tone: "success" | "error"; message: string };

const ROLE_LABEL: Record<MembershipView["role"], string> = {
  STUDENT: "Étudiant",
  DELEGATE: "Délégué",
  ADMIN: "Administrateur",
};

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
}

/* ──────────────────────────────────────────────────────────────────
   Dialogue accessible (modal, piège de focus, Échap) — le projet n'a
   pas de dialogue générique : la structure reprend celle de
   `ConfirmDeleteButton` (U3) sans la modifier.
   ────────────────────────────────────────────────────────────────── */

export function ConfirmDialogShell({
  title,
  description,
  icon = AlertTriangle,
  iconTone = "danger",
  children,
  error,
  pending = false,
  confirmLabel,
  confirmVariant = "danger",
  cancelLabel = "Annuler",
  onCancel,
  onConfirm,
}: {
  title: string;
  description: React.ReactNode;
  icon?: typeof AlertTriangle;
  iconTone?: "danger" | "warning" | "info";
  children?: React.ReactNode;
  error?: string | null;
  pending?: boolean;
  confirmLabel: string;
  confirmVariant?: "danger" | "default" | "outline";
  cancelLabel?: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const pendingRef = useRef(pending);
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (pendingRef.current) return;
        e.preventDefault();
        onCancelRef.current();
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
  }, []);

  const Icon = icon;
  const toneClass =
    iconTone === "warning"
      ? "bg-warning/10 text-warning"
      : iconTone === "info"
      ? "bg-info/10 text-info"
      : "bg-danger/10 text-danger";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in"
        aria-hidden="true"
        onClick={() => {
          if (!pending) onCancelRef.current();
        }}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-desc"
        className="relative w-full max-w-md animate-scale-in rounded-2xl border border-border bg-card p-5 shadow-float sm:p-6"
      >
        <div className="flex items-start gap-4">
          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${toneClass}`}>
            <Icon size={22} />
          </div>
          <div className="min-w-0 flex-1 space-y-1.5">
            <h2
              id="confirm-dialog-title"
              className="font-display text-lg font-bold tracking-tight text-foreground"
            >
              {title}
            </h2>
            <p id="confirm-dialog-desc" className="text-sm leading-relaxed text-muted-foreground">
              {description}
            </p>
          </div>
        </div>

        {children}

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
            onClick={() => onCancelRef.current()}
            disabled={pending}
          >
            {cancelLabel ?? "Annuler"}
          </Button>
          <Button
            type="button"
            variant={confirmVariant}
            isLoading={pending}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ── Dialogue « Quitter la classe » ── */

export function LeaveClassDialog({
  className,
  error,
  pending,
  onCancel,
  onConfirm,
}: {
  className: string;
  error?: string | null;
  pending?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <ConfirmDialogShell
      title="Quitter la classe ?"
      description={
        <>
          Vous perdrez l&apos;accès aux données privées de cette classe : tâches, documents, hints,
          cours enregistrés, chat, emploi du temps, évaluations et notifications de classe.
        </>
      }
      icon={UserRoundX}
      iconTone="danger"
      error={error}
      pending={pending}
      confirmLabel="Confirmer mon départ"
      confirmVariant="danger"
      onCancel={onCancel}
      onConfirm={onConfirm}
    >
      <div className="mt-4 rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-sm font-semibold text-foreground break-words">
        « {className} »
      </div>
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        Vos anciennes données (soumissions, messages, documents publiés) ne sont pas supprimées,
        mais vous n&apos;y aurez plus accès. Vous pourrez ensuite demander à rejoindre une autre
        classe.
      </p>
    </ConfirmDialogShell>
  );
}

/* ── Dialogue « Changer de classe » ── */

export function TransferClassDialog({
  classes,
  currentClassName,
  value,
  error,
  pending,
  onChangeValue,
  onCancel,
  onConfirm,
}: {
  classes: ClassOption[];
  currentClassName: string | null;
  value: string;
  error?: string | null;
  pending?: boolean;
  onChangeValue: (classId: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <ConfirmDialogShell
      title="Demander à changer de classe"
      description={
        <>
          Votre demande sera examinée par l&apos;administrateur ou le délégué de la classe
          choisie. Ce n&apos;est pas une approbation immédiate : vous conservez votre classe
          actuelle tant que la demande n&apos;a pas été acceptée.
        </>
      }
      icon={ArrowLeftRight}
      iconTone="warning"
      error={error}
      pending={pending}
      confirmLabel="Envoyer ma demande"
      confirmVariant="default"
      onCancel={onCancel}
      onConfirm={onConfirm}
    >
      <div className="mt-4 space-y-2">
        <label htmlFor="transfer-class-select" className="text-xs font-semibold text-foreground">
          Classe souhaitée
        </label>
        <Select
          id="transfer-class-select"
          value={value}
          onChange={(e) => onChangeValue(e.target.value)}
          disabled={pending}
        >
          <option value="">Sélectionner une classe</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} — {c.level} ({c.academicYear})
            </option>
          ))}
        </Select>
        {currentClassName && (
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Votre classe actuelle : <span className="font-semibold">{currentClassName}</span>
          </p>
        )}
      </div>
    </ConfirmDialogShell>
  );
}

/* ── Dialogue « Annuler la demande » ── */

export function CancelRequestDialog({
  pending,
  error,
  onCancel,
  onConfirm,
}: {
  pending?: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <ConfirmDialogShell
      title="Annuler votre demande ?"
      description="Votre demande de classe sera annulée et ne sera pas transmise au délégué. Vous pourrez en soumettre une nouvelle à tout moment."
      icon={Info}
      iconTone="info"
      pending={pending}
      error={error}
      confirmLabel="Annuler la demande"
      confirmVariant="outline"
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}

/* ──────────────────────────────────────────────────────────────────
   Éléments d'état
   ────────────────────────────────────────────────────────────────── */

/** Message de succès / d'erreur (jamais affiché avant la réponse serveur). */
export function StatusAlert({
  tone,
  message,
  onDismiss,
}: {
  tone: "success" | "error";
  message: string;
  onDismiss?: () => void;
}) {
  const isSuccess = tone === "success";
  return (
    <div
      role={isSuccess ? "status" : "alert"}
      className={`flex items-start gap-3 rounded-2xl border p-4 text-sm animate-fade-in ${
        isSuccess
          ? "border-success/40 bg-success/8 text-success"
          : "border-danger/40 bg-danger/8 text-danger"
      }`}
    >
      {isSuccess ? (
        <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
      ) : (
        <AlertTriangle size={18} className="mt-0.5 shrink-0" />
      )}
      <p className="flex-1 leading-relaxed">{message}</p>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Fermer le message"
          className="shrink-0 rounded-lg p-1 transition-colors hover:bg-black/5"
        >
          <X size={15} />
        </button>
      )}
    </div>
  );
}

/** Informations sur la classe actuelle (+ rôle, date d'arrivée). */
export function ClassSummaryCard({
  view,
  onLeave,
  onChangeClass,
}: {
  view: MembershipView;
  onLeave: () => void;
  onChangeClass: () => void;
}) {
  const canAct = !view.pending && (view.canLeave || view.canRequestTransfer);

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <GraduationCap size={21} strokeWidth={1.75} />
            </div>
            <div>
              <p className="font-display text-lg font-bold tracking-tight text-foreground">
                {view.className ?? "Classe actuelle"}
              </p>
              <p className="text-sm text-muted-foreground">
                {[view.classLevel, view.academicYear].filter(Boolean).join(" — ")}
              </p>
              {view.memberSince && (
                <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock size={12} />
                  Membre depuis le {formatDate(view.memberSince)}
                </p>
              )}
            </div>
          </div>
          <Badge variant={view.role === "STUDENT" ? "default" : "warning"}>
            {ROLE_LABEL[view.role]}
          </Badge>
        </div>

        {canAct ? (
          <div className="flex flex-col gap-2.5 border-t border-border/70 pt-4 sm:flex-row">
            <Button type="button" variant="outline" className="gap-2" onClick={onChangeClass}>
              <ArrowLeftRight size={15} />
              Changer de classe
            </Button>
            <Button type="button" variant="danger" className="gap-2" onClick={onLeave}>
              <UserRoundX size={15} />
              Quitter la classe
            </Button>
          </div>
        ) : view.pending ? (
          <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/40 p-3.5 text-xs leading-relaxed text-muted-foreground">
            <Info size={16} className="mt-0.5 shrink-0" />
            <p>
              Une demande concernant votre classe est en attente : les actions de départ et de
              changement sont de nouveau disponibles une fois celle-ci traitée.
            </p>
          </div>
        ) : (
          <BlockedNotice role={view.role} />
        )}
      </CardContent>
    </Card>
  );
}

/** Rôle qui empêche le départ / la demande de transfert. */
export function BlockedNotice({ role }: { role: MembershipView["role"] }) {
  const isDelegate = role === "DELEGATE";
  return (
    <div
      className={`flex items-start gap-3 rounded-xl border p-3.5 text-xs leading-relaxed ${
        isDelegate ? "border-warning/40 bg-warning/8 text-warning" : "border-info/40 bg-info/8 text-info"
      }`}
    >
      <ShieldAlert size={16} className="mt-0.5 shrink-0" />
      <p>
        {isDelegate
          ? "En tant que délégué, vous ne pouvez pas quitter cette classe ni demander un changement : faites d'abord révoquer votre rôle par un administrateur (Administration → Gestion des Délégués)."
          : "Votre compte administrateur n'est pas rattaché à une classe depuis les paramètres : le rattachement relève du système."}
      </p>
    </div>
  );
}

/** État « aucune classe » : parcours réel de demande de rejoindre. */
export function JoinClassCard({
  classes,
  value,
  error,
  pending,
  onChangeValue,
  onSubmit,
}: {
  classes: ClassOption[];
  value: string;
  error?: string | null;
  pending?: boolean;
  onChangeValue: (classId: string) => void;
  onSubmit: () => void;
}) {
  if (classes.length === 0) {
    return (
      <Card>
        <CardContent className="space-y-2 p-5">
          <p className="text-sm font-semibold text-foreground">Aucune classe disponible</p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Aucune classe ne peut être proposée pour le moment. Contactez un administrateur si
            vous pensez qu&apos;une classe devrait apparaître ici.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-info/10 text-info">
            <LogIn size={20} strokeWidth={1.75} />
          </div>
          <div>
            <p className="font-display text-lg font-bold tracking-tight text-foreground">
              Vous n&apos;appartenez à aucune classe
            </p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Sélectionnez la classe que vous souhaitez rejoindre. Votre demande sera validée par
              l&apos;administrateur ou le délégué de cette classe.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <label htmlFor="join-class-select" className="text-xs font-semibold text-foreground">
            Classe souhaitée
          </label>
          <Select
            id="join-class-select"
            value={value}
            onChange={(e) => onChangeValue(e.target.value)}
            disabled={pending}
          >
            <option value="">Sélectionner une classe</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} — {c.level} ({c.academicYear})
              </option>
            ))}
          </Select>
        </div>

        {error && (
          <div role="alert" className="flex items-center gap-2 rounded-xl border border-danger/30 bg-danger/8 p-3 text-xs text-danger">
            <AlertTriangle size={15} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <Button type="button" className="w-full gap-2" isLoading={pending} onClick={onSubmit}>
          <LogIn size={15} />
          Demander à rejoindre cette classe
        </Button>
      </CardContent>
    </Card>
  );
}

/** Demande en attente : statut, classe visée, annulation. */
export function PendingRequestCard({
  request,
  cancelError,
  cancelPending,
  onCancelRequest,
}: {
  request: MembershipRequestSnapshot;
  cancelError?: string | null;
  cancelPending?: boolean;
  onCancelRequest: () => void;
}) {
  const isChange = request.previousClassId !== null;
  return (
    <Card className="border-warning/30">
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-warning/12 text-warning">
              <Clock size={20} strokeWidth={1.75} />
            </div>
            <div>
              <p className="font-display text-lg font-bold tracking-tight text-foreground">
                {isChange ? "Changement de classe en attente" : "Demande de rejoindre en attente"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Classe demandée : <span className="font-semibold text-foreground">{request.className ?? "—"}</span>
                {isChange && request.previousClassName && (
                  <>
                    {" "}
                    (depuis <span className="font-semibold text-foreground">{request.previousClassName}</span>)
                  </>
                )}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Demandée le {formatDate(request.createdAt)}
              </p>
            </div>
          </div>
          <Badge variant="warning">{registrationStatusLabel(request.status)}</Badge>
        </div>

        <p className="text-xs leading-relaxed text-muted-foreground">
          Un administrateur ou le délégué de la classe visée doit valider votre demande. Vous
          conservez vos accès actuels en attendant{isChange ? " ; vous n'avez aucun accès à la classe demandée." : "."}
        </p>

        {cancelError && (
          <div role="alert" className="flex items-center gap-2 rounded-xl border border-danger/30 bg-danger/8 p-3 text-xs text-danger">
            <AlertTriangle size={15} className="shrink-0" />
            <span>{cancelError}</span>
          </div>
        )}

        <div className="border-t border-border/70 pt-4">
          <Button
            type="button"
            variant="outline"
            className="gap-2"
            isLoading={cancelPending}
            onClick={onCancelRequest}
          >
            <X size={15} />
            Annuler ma demande
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/** Dernière décision (refus / annulation) quand aucune demande n'est en attente. */
export function LastRequestNotice({
  lastDecision,
}: {
  lastDecision: NonNullable<MembershipView["lastDecision"]>;
}) {
  if (lastDecision.status === "ACCEPTED") return null;

  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-2xl border border-border bg-muted/40 p-4 text-xs leading-relaxed text-muted-foreground"
    >
      <Info size={16} className="mt-0.5 shrink-0" />
      <p>
        Dernière demande {lastDecision.isChange ? "de changement de classe " : "d'inscription "}
        {registrationStatusLabel(lastDecision.status).toLowerCase()}
        {lastDecision.className && (
          <>
            {" "}
            pour <span className="font-semibold text-foreground">{lastDecision.className}</span>
          </>
        )}
        {lastDecision.decidedAt && <> le {formatDate(lastDecision.decidedAt)}</>}.{" "}
        {(lastDecision.status === "REJECTED" || lastDecision.status === "CANCELLED") &&
          "Vous pouvez en soumettre une nouvelle."}
      </p>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────
   Composant principal
   ────────────────────────────────────────────────────────────────── */

export function MyClassSection({ view }: { view: MembershipView }) {
  const router = useRouter();

  const [dialog, setDialog] = useState<null | "leave" | "transfer" | "cancel-request">(null);
  const [pending, setPending] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [targetClassId, setTargetClassId] = useState("");

  const isJoinRequest = view.kind === "NO_CLASS";

  const openDialog = (next: typeof dialog) => {
    setDialogError(null);
    setDialog(next);
  };
  const closeDialog = () => {
    if (pending) return;
    setDialog(null);
    setDialogError(null);
  };

  const handleLeave = async () => {
    if (pending) return;
    setPending(true);
    setDialogError(null);
    const res: MembershipActionResult = await leaveClassAction();
    setPending(false);
    if ("error" in res) {
      setDialogError(res.error);
      return;
    }
    setDialog(null);
    setNotice({
      tone: "success",
      message:
        "Vous avez quitté la classe. Vos anciennes données restent conservées mais vous n'y avez plus accès. Vous pouvez demander à rejoindre une autre classe.",
    });
    setTargetClassId("");
    router.refresh();
  };

  const submitTransfer = async () => {
    if (pending) return;
    if (!targetClassId) {
      const message = "Veuillez sélectionner une classe.";
      if (dialog) setDialogError(message);
      else setActionError(message);
      return;
    }
    setPending(true);
    setDialogError(null);
    setActionError(null);
    const fd = new FormData();
    fd.set("classId", targetClassId);
    const res: MembershipActionResult = await requestClassTransferAction(fd);
    setPending(false);
    if ("error" in res) {
      if (dialog) setDialogError(res.error);
      else setActionError(res.error);
      return;
    }
    setDialog(null);
    setNotice({
      tone: "success",
      message: isJoinRequest
        ? "Votre demande a bien été enregistrée. Un administrateur ou le délégué de la classe choisie devra la valider."
        : "Votre demande de changement de classe a bien été enregistrée. Vous conservez votre classe actuelle jusqu'à sa validation.",
    });
    setTargetClassId("");
    router.refresh();
  };

  const handleCancelRequest = async () => {
    if (pending || !view.pending) return;
    setPending(true);
    setDialogError(null);
    const res: MembershipActionResult = await cancelClassRequestAction(view.pending.id);
    setPending(false);
    if ("error" in res) {
      setDialogError(res.error);
      return;
    }
    setDialog(null);
    setNotice({ tone: "success", message: "Votre demande a été annulée." });
    router.refresh();
  };

  return (
    <div className="space-y-5">
      {notice && (
        <StatusAlert tone={notice.tone} message={notice.message} onDismiss={() => setNotice(null)} />
      )}

      {view.kind === "ADMIN" ? (
        <Card>
          <CardContent className="space-y-3 p-5">
            <p className="font-display text-lg font-bold tracking-tight text-foreground">
              Compte administrateur
            </p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Votre compte est un compte administrateur global : le rattachement à une classe ne
              se gère pas depuis les paramètres.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {view.classId ? (
            <ClassSummaryCard
              view={view}
              onLeave={() => openDialog("leave")}
              onChangeClass={() => openDialog("transfer")}
            />
          ) : view.pending ? (
            // Sans classe mais déjà une demande en attente : le formulaire de
            // demande serait rejeté (une seule demande PENDING par compte).
            null
          ) : view.canRequestTransfer ? (
            <JoinClassCard
              classes={view.classOptions}
              value={targetClassId}
              error={actionError}
              pending={pending && !dialog}
              onChangeValue={(id) => {
                setTargetClassId(id);
                setActionError(null);
              }}
              onSubmit={() => void submitTransfer()}
            />
          ) : (
            <BlockedNotice role={view.role} />
          )}

          {view.pending && (
            <PendingRequestCard
              request={view.pending}
              cancelError={dialog === "cancel-request" ? dialogError : null}
              cancelPending={pending && dialog === "cancel-request"}
              onCancelRequest={() => openDialog("cancel-request")}
            />
          )}

          {!view.pending && view.lastDecision && (
            <LastRequestNotice lastDecision={view.lastDecision} />
          )}
        </>
      )}

      {dialog === "leave" && view.className && (
        <LeaveClassDialog
          className={view.className}
          error={dialogError}
          pending={pending}
          onCancel={closeDialog}
          onConfirm={() => void handleLeave()}
        />
      )}

      {dialog === "transfer" && (
        <TransferClassDialog
          classes={view.classOptions}
          currentClassName={view.className}
          value={targetClassId}
          error={dialogError}
          pending={pending}
          onChangeValue={(id) => {
            setTargetClassId(id);
            setDialogError(null);
          }}
          onCancel={closeDialog}
          onConfirm={() => void submitTransfer()}
        />
      )}

      {dialog === "cancel-request" && (
        <CancelRequestDialog
          error={dialogError}
          pending={pending}
          onCancel={closeDialog}
          onConfirm={() => void handleCancelRequest()}
        />
      )}
    </div>
  );
}
