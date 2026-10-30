"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Edit3,
  GraduationCap,
  Loader2,
  Mail,
  School,
  Shield,
  Star,
  User,
  UserCheck,
  X,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent } from "@/components/ui/Card";
import { updateProfileAction } from "@/actions/profile";
import { toast } from "@/lib/toast";
import type { UserRole, RegistrationStatus } from "@/types/database.types";

/* ──────────────────────────────────────────────────────────────────
   Types
   ────────────────────────────────────────────────────────────────── */

export type ProfileData = {
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
  classId: string | null;
  className: string | null;
  classLevel: string | null;
  academicYear: string | null;
  createdAt: string | null;
  memberSince: string | null;
  approvalStatus: RegistrationStatus | null;
};

type ActionResult = { success: true } | { error: string };

/* ──────────────────────────────────────────────────────────────────
   Helpers
   ────────────────────────────────────────────────────────────────── */

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
}

const ROLE_LABEL: Record<UserRole, string> = {
  STUDENT: "Étudiant",
  DELEGATE: "Délégué",
  ADMIN: "Administrateur",
};

const ROLE_VARIANT: Record<UserRole, "neutral" | "warning" | "danger"> = {
  STUDENT: "neutral",
  DELEGATE: "warning",
  ADMIN: "danger",
};

const STATUS_LABEL: Record<RegistrationStatus, string> = {
  PENDING: "En attente de validation",
  ACCEPTED: "Compte approuvé",
  REJECTED: "Demande refusée",
  CANCELLED: "Demande annulée",
};

/* ──────────────────────────────────────────────────────────────────
   Avatar initiales
   ────────────────────────────────────────────────────────────────── */

function InitialsAvatar({
  firstName,
  lastName,
  size = "lg",
}: {
  firstName: string;
  lastName: string;
  size?: "sm" | "md" | "lg";
}) {
  const initials = `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase() || "U";
  const sizeClass =
    size === "lg"
      ? "h-20 w-20 text-2xl"
      : size === "md"
      ? "h-14 w-14 text-lg"
      : "h-9 w-9 text-sm";

  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-2xl bg-primary/12 font-display font-bold text-primary ${sizeClass}`}
      aria-hidden="true"
    >
      {initials}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────
   Alerte de résultat (succès / erreur)
   ────────────────────────────────────────────────────────────────── */

function ResultAlert({
  result,
  onDismiss,
}: {
  result: ActionResult;
  onDismiss: () => void;
}) {
  const isSuccess = "success" in result;
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
      <p className="flex-1 leading-relaxed">
        {"success" in result
          ? "Votre profil a été mis à jour."
          : (result as { error: string }).error}
      </p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Fermer le message"
        className="shrink-0 rounded-lg p-1 transition-colors hover:bg-black/5"
      >
        <X size={15} />
      </button>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────
   Formulaire d'édition du profil (inline)
   ────────────────────────────────────────────────────────────────── */

function EditProfileForm({
  profile,
  onSuccess,
  onCancel,
}: {
  profile: ProfileData;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [firstName, setFirstName] = useState(profile.firstName);
  const [lastName, setLastName] = useState(profile.lastName);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const firstRef = useRef<HTMLInputElement>(null);

  const isDirty = firstName !== profile.firstName || lastName !== profile.lastName;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isDirty || isPending) return;
    setError(null);

    const fd = new FormData();
    fd.set("firstName", firstName);
    fd.set("lastName", lastName);

    startTransition(async () => {
      const result = await updateProfileAction(fd);
      if ("error" in result) {
        setError(result.error);
        toast.error(result.error);
      } else {
        onSuccess();
      }
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-2xl border border-primary/20 bg-primary/4 p-5"
      aria-label="Modifier le profil"
      noValidate
    >
      <p className="text-sm font-bold text-foreground">Modifier les informations personnelles</p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="profile-firstName" className="text-xs font-semibold text-foreground">
            Prénom
          </label>
          <Input
            id="profile-firstName"
            ref={firstRef}
            name="firstName"
            value={firstName}
            onChange={(e) => {
              setFirstName(e.target.value);
              setError(null);
            }}
            disabled={isPending}
            autoComplete="given-name"
            placeholder="Prénom"
            required
            minLength={2}
            maxLength={80}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="profile-lastName" className="text-xs font-semibold text-foreground">
            Nom
          </label>
          <Input
            id="profile-lastName"
            name="lastName"
            value={lastName}
            onChange={(e) => {
              setLastName(e.target.value);
              setError(null);
            }}
            disabled={isPending}
            autoComplete="family-name"
            placeholder="Nom de famille"
            required
            minLength={2}
            maxLength={80}
          />
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-xl border border-danger/30 bg-danger/8 p-3 text-xs text-danger"
        >
          <AlertTriangle size={14} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isPending}
        >
          Annuler
        </Button>
        <Button
          type="submit"
          variant="default"
          disabled={!isDirty || isPending}
          isLoading={isPending}
          loadingText="Enregistrement…"
          className="gap-2"
        >
          {!isPending && <Check size={15} />}
          Enregistrer
        </Button>
      </div>
    </form>
  );
}

/* ──────────────────────────────────────────────────────────────────
   Section principale — Mon profil
   ────────────────────────────────────────────────────────────────── */

export function ProfileSection({ profile }: { profile: ProfileData }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [localName, setLocalName] = useState({
    first: profile.firstName,
    last: profile.lastName,
  });

  function handleSuccess() {
    setEditing(false);
    setResult({ success: true });
    toast.success("Modifications enregistrées.");
    setLocalName({
      first: (document.getElementById("profile-firstName") as HTMLInputElement | null)?.value ?? localName.first,
      last: (document.getElementById("profile-lastName") as HTMLInputElement | null)?.value ?? localName.last,
    });
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {result && (
        <ResultAlert result={result} onDismiss={() => setResult(null)} />
      )}

      {/* ── En-tête du profil ── */}
      <Card>
        <CardContent className="p-5 sm:p-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-6">
            {/* Avatar */}
            <InitialsAvatar firstName={localName.first} lastName={localName.last} size="lg" />

            {/* Identité */}
            <div className="flex-1 min-w-0 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-display text-xl font-bold tracking-tight text-foreground truncate">
                    {localName.first} {localName.last}
                  </h2>
                  <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Mail size={13} className="shrink-0" />
                    <span className="truncate">{profile.email}</span>
                  </p>
                </div>
                <Badge variant={ROLE_VARIANT[profile.role]} className="shrink-0">
                  {profile.role === "ADMIN" && <Shield size={11} className="mr-1" />}
                  {profile.role === "DELEGATE" && <Star size={11} className="mr-1" />}
                  {profile.role === "STUDENT" && <User size={11} className="mr-1" />}
                  {ROLE_LABEL[profile.role]}
                </Badge>
              </div>

              {!editing && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => {
                    setResult(null);
                    setEditing(true);
                  }}
                >
                  <Edit3 size={13} />
                  Modifier le profil
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Formulaire d'édition (inline) ── */}
      {editing && (
        <EditProfileForm
          profile={{ ...profile, firstName: localName.first, lastName: localName.last }}
          onSuccess={handleSuccess}
          onCancel={() => setEditing(false)}
        />
      )}

      {/* ── Informations personnelles (lecture) ── */}
      <section aria-labelledby="personal-info-heading">
        <div className="mb-3 flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
            <User size={14} className="text-primary" />
          </div>
          <h2 id="personal-info-heading" className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
            Informations personnelles
          </h2>
        </div>

        <Card>
          <CardContent className="divide-y divide-border/60 p-0">
            <InfoRow label="Prénom" value={localName.first} />
            <InfoRow label="Nom de famille" value={localName.last} />
            <InfoRow
              label="Adresse e-mail"
              value={profile.email}
              hint="L'adresse e-mail est gérée depuis les paramètres de votre compte."
            />
            <InfoRow
              label="Membre depuis"
              value={formatDate(profile.createdAt)}
            />
          </CardContent>
        </Card>
      </section>

      {/* ── Informations académiques (lecture seule) ── */}
      <section aria-labelledby="academic-info-heading">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-info/10">
              <GraduationCap size={14} className="text-info" />
            </div>
            <h2 id="academic-info-heading" className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
              Informations académiques
            </h2>
          </div>
          <Link
            href="/dashboard/settings/class"
            className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-all hover:border-primary/30 hover:text-primary"
          >
            <School size={12} />
            Gérer ma classe
          </Link>
        </div>

        <Card>
          <CardContent className="divide-y divide-border/60 p-0">
            <InfoRow
              label="Classe"
              value={
                profile.className
                  ? `${profile.className}${profile.classLevel ? ` — ${profile.classLevel}` : ""}${profile.academicYear ? ` (${profile.academicYear})` : ""}`
                  : "Aucune classe"
              }
              readOnly
              hint="Modifiable depuis « Ma classe »."
            />
            <InfoRow
              label="Rôle"
              value={ROLE_LABEL[profile.role]}
              readOnly
              hint={
                profile.role === "ADMIN"
                  ? "Attribué par le système."
                  : profile.role === "DELEGATE"
                  ? "Attribué par un administrateur."
                  : "Rôle par défaut."
              }
            />
            <InfoRow
              label="Statut du compte"
              value={profile.approvalStatus ? STATUS_LABEL[profile.approvalStatus] : "—"}
              readOnly
              hint="Déterminé par le processus d'approbation."
            />
            {profile.memberSince && (
              <InfoRow
                label="Dans la classe depuis"
                value={formatDate(profile.memberSince)}
                readOnly
              />
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────
   Ligne d'information (lecture)
   ────────────────────────────────────────────────────────────────── */

function InfoRow({
  label,
  value,
  hint,
  readOnly = false,
}: {
  label: string;
  value: string;
  hint?: string;
  readOnly?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5 px-5 py-4 sm:flex-row sm:items-start sm:gap-6">
      <dt className="shrink-0 text-xs font-semibold text-muted-foreground sm:w-44">
        {label}
        {readOnly && (
          <span className="ml-1.5 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">
            lecture seule
          </span>
        )}
      </dt>
      <dd className="flex-1 min-w-0">
        <span className="text-sm text-foreground break-words">{value}</span>
        {hint && (
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{hint}</p>
        )}
      </dd>
    </div>
  );
}
