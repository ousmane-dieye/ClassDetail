"use client";

import { useId, useMemo, useState, useTransition } from "react";
import {
  AlertCircle,
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Filter,
  GraduationCap,
  Loader2,
  Mail,
  Search,
  Trash2,
  User,
  UserCheck,
  UserMinus,
  Users,
  UserX,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import {
  removeStudentFromClassAction,
  deleteStudentAccountAction,
} from "@/actions/admin-students";
import { appointDelegateAction, removeDelegateAction } from "@/actions/classes";
import { toast } from "@/lib/toast";

/* ──────────────────────────────────────────────────────────────────
   Types
   ────────────────────────────────────────────────────────────────── */

export type StudentItem = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: "STUDENT" | "DELEGATE";
  classId: string | null;
  className: string | null;
  classLevel: string | null;
  academicYear: string | null;
  createdAt?: string | null;
};

export type ClassOption = {
  id: string;
  name: string;
  level: string;
  academicYear: string;
};

interface StudentsManagementSectionProps {
  students: StudentItem[];
  classes: ClassOption[];
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

/* ──────────────────────────────────────────────────────────────────
   Composant principal
   ────────────────────────────────────────────────────────────────── */

export function StudentsManagementSection({
  students,
  classes,
}: StudentsManagementSectionProps) {
  // Filtres et recherche
  const [search, setSearch] = useState("");
  const [selectedClass, setSelectedClass] = useState<string>("ALL");
  const [selectedRole, setSelectedRole] = useState<string>("ALL");

  // Modale « Retirer de la classe »
  const [studentToRemove, setStudentToRemove] = useState<StudentItem | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [isRemoving, startRemove] = useTransition();

  // Modale « Supprimer le compte »
  const [studentToDelete, setStudentToDelete] = useState<StudentItem | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, startDelete] = useTransition();

  // Action délégué (transition locale)
  const [delegatePendingId, setDelegatePendingId] = useState<string | null>(null);

  // Message flash de confirmation globale
  const [flashMessage, setFlashMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Filtrage réactif en mémoire
  const filteredStudents = useMemo(() => {
    const q = search.trim().toLowerCase();
    return students.filter((s) => {
      // Recherche textuelle nom, prénom, email
      if (q) {
        const fullName = `${s.firstName} ${s.lastName}`.toLowerCase();
        const reverseName = `${s.lastName} ${s.firstName}`.toLowerCase();
        const email = s.email.toLowerCase();
        if (!fullName.includes(q) && !reverseName.includes(q) && !email.includes(q)) {
          return false;
        }
      }

      // Filtre classe
      if (selectedClass === "NONE") {
        if (s.classId !== null) return false;
      } else if (selectedClass !== "ALL") {
        if (s.classId !== selectedClass) return false;
      }

      // Filtre rôle
      if (selectedRole !== "ALL") {
        if (s.role !== selectedRole) return false;
      }

      return true;
    });
  }, [students, search, selectedClass, selectedRole]);

  // Exécution : Retrait d'une classe
  async function handleConfirmRemove() {
    if (!studentToRemove) return;
    setRemoveError(null);

    startRemove(async () => {
      const result = await removeStudentFromClassAction(studentToRemove.id);
      if ("error" in result) {
        setRemoveError(result.error);
        toast.error(result.error);
      } else {
        const msg = `${studentToRemove.firstName} ${studentToRemove.lastName} a été retiré(e) de sa classe avec succès.`;
        setFlashMessage({
          type: "success",
          text: msg,
        });
        toast.success(msg);
        setStudentToRemove(null);
      }
    });
  }

  // Exécution : Suppression définitive du compte
  async function handleConfirmDelete() {
    if (!studentToDelete) return;
    setDeleteError(null);

    startDelete(async () => {
      const result = await deleteStudentAccountAction(studentToDelete.id);
      if ("error" in result) {
        setDeleteError(result.error);
        toast.error(result.error);
      } else {
        const msg = `Le compte de ${studentToDelete.firstName} ${studentToDelete.lastName} a été définitivement supprimé.`;
        setFlashMessage({
          type: "success",
          text: msg,
        });
        toast.success(msg);
        setStudentToDelete(null);
      }
    });
  }

  // Promotion / Révocation de délégué
  async function handleToggleDelegate(student: StudentItem) {
    setDelegatePendingId(student.id);
    try {
      if (student.role === "DELEGATE") {
        await removeDelegateAction(student.id);
        const msg = `Le rôle de délégué a été révoqué pour ${student.firstName} ${student.lastName}.`;
        setFlashMessage({
          type: "success",
          text: msg,
        });
        toast.success(msg);
      } else {
        await appointDelegateAction(student.id);
        const msg = `${student.firstName} ${student.lastName} a été nommé(e) délégué(e) avec succès.`;
        setFlashMessage({
          type: "success",
          text: msg,
        });
        toast.success(msg);
      }
    } catch {
      const msg = "Une erreur est survenue lors de la mise à jour du rôle délégué.";
      setFlashMessage({
        type: "error",
        text: msg,
      });
      toast.error(msg);
    } finally {
      setDelegatePendingId(null);
    }
  }

  const hasActiveFilters = search.length > 0 || selectedClass !== "ALL" || selectedRole !== "ALL";

  return (
    <section aria-labelledby="section-students-management" className="space-y-5">
      {/* ── En-tête de section ── */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Users size={18} strokeWidth={2.25} />
          </div>
          <div>
            <h2 id="section-students-management" className="text-xl font-bold tracking-tight text-foreground">
              Gestion des Étudiants
            </h2>
            <p className="text-xs text-muted-foreground">
              Recherchez, gérez les rôles, retirez d&apos;une classe ou supprimez des comptes étudiants.
            </p>
          </div>
        </div>

        <Badge variant="outline" className="self-start sm:self-auto text-xs font-semibold px-3 py-1">
          {filteredStudents.length} sur {students.length} étudiant(s)
        </Badge>
      </div>

      {/* Message flash de notification */}
      {flashMessage && (
        <div
          role="status"
          className={`flex items-center justify-between gap-3 rounded-xl p-3.5 text-xs font-medium ${
            flashMessage.type === "success"
              ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
              : "border border-danger/30 bg-danger/10 text-danger"
          }`}
        >
          <div className="flex items-center gap-2">
            {flashMessage.type === "success" ? (
              <CheckCircle2 size={16} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <AlertCircle size={16} className="shrink-0 text-danger" />
            )}
            <span>{flashMessage.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFlashMessage(null)}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Fermer la notification"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* ── Barre de contrôle : Recherche et filtres ── */}
      <Card hoverEffect={false} className="border-border/80">
        <CardContent className="p-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-12">
            {/* Champ de recherche */}
            <div className="relative sm:col-span-6">
              <Search
                size={16}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
              />
              <Input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher par nom, prénom ou email..."
                className="pl-9 pr-8"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label="Effacer la recherche"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Filtre Classe */}
            <div className="sm:col-span-3">
              <select
                value={selectedClass}
                onChange={(e) => setSelectedClass(e.target.value)}
                className="flex h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-xs font-medium text-foreground shadow-inner-sm transition-all focus-visible:outline-none focus-visible:border-primary/60 focus-visible:ring-2 focus-visible:ring-ring/40"
                aria-label="Filtrer par classe"
              >
                <option value="ALL">Toutes les classes</option>
                <option value="NONE">Sans classe uniquement</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.level})
                  </option>
                ))}
              </select>
            </div>

            {/* Filtre Rôle */}
            <div className="sm:col-span-3">
              <select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value)}
                className="flex h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-xs font-medium text-foreground shadow-inner-sm transition-all focus-visible:outline-none focus-visible:border-primary/60 focus-visible:ring-2 focus-visible:ring-ring/40"
                aria-label="Filtrer par rôle"
              >
                <option value="ALL">Tous les rôles</option>
                <option value="STUDENT">Étudiants uniquement</option>
                <option value="DELEGATE">Délégués uniquement</option>
              </select>
            </div>
          </div>

          {/* Reset rapide des filtres */}
          {hasActiveFilters && (
            <div className="flex items-center justify-between border-t border-border/50 pt-2.5 text-xs text-muted-foreground">
              <span>Filtres actifs appliqués</span>
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setSelectedClass("ALL");
                  setSelectedRole("ALL");
                }}
                className="font-medium text-primary hover:underline"
              >
                Réinitialiser les filtres
              </button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Liste des étudiants ── */}
      {filteredStudents.length === 0 ? (
        <Card hoverEffect={false} className="border-dashed p-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/60 text-muted-foreground mb-3">
            <Users size={22} />
          </div>
          <p className="text-sm font-bold text-foreground">Aucun étudiant trouvé</p>
          <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
            {hasActiveFilters
              ? "Aucun compte ne correspond à vos critères de recherche ou de filtre."
              : "Aucun étudiant n'est actuellement inscrit dans le système."}
          </p>
          {hasActiveFilters && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSearch("");
                setSelectedClass("ALL");
                setSelectedRole("ALL");
              }}
              className="mt-4"
            >
              Effacer la recherche
            </Button>
          )}
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-1">
          {filteredStudents.map((student) => {
            const isDelegate = student.role === "DELEGATE";
            const hasClass = Boolean(student.classId);
            const isDelegateActionPending = delegatePendingId === student.id;

            return (
              <Card
                key={student.id}
                hoverEffect={false}
                className="overflow-hidden border-border/80 transition-all hover:border-border hover:shadow-card"
              >
                <CardContent className="p-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  {/* Informations de l'étudiant */}
                  <div className="flex items-start gap-3.5 min-w-0 flex-1">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary font-bold text-sm shadow-inner-sm">
                      {student.firstName?.[0] ?? "?"}
                      {student.lastName?.[0] ?? ""}
                    </div>

                    <div className="min-w-0 space-y-1 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-foreground text-sm truncate">
                          {student.firstName} {student.lastName}
                        </span>

                        {isDelegate ? (
                          <Badge variant="warning" className="text-[10px] gap-1 px-2 py-0.5">
                            ★ Délégué
                          </Badge>
                        ) : (
                          <Badge variant="neutral" className="text-[10px] px-2 py-0.5">
                            Étudiant
                          </Badge>
                        )}

                        {hasClass ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                            <BookOpen size={11} />
                            {student.className}
                            {student.classLevel && ` — ${student.classLevel}`}
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                            Sans classe
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1 truncate text-[11px]">
                          <Mail size={12} className="shrink-0" />
                          {student.email}
                        </span>
                        {student.createdAt && (
                          <span className="text-[11px]">
                            Inscrit le {formatDate(student.createdAt)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions d'administration */}
                  <div className="flex flex-wrap items-center gap-2 pt-2 sm:pt-0 border-t border-border/50 sm:border-0 sm:shrink-0">
                    {/* Nomination / Révocation de délégué */}
                    {hasClass && (
                      <Button
                        type="button"
                        size="sm"
                        variant={isDelegate ? "outline" : "outline"}
                        onClick={() => handleToggleDelegate(student)}
                        disabled={isDelegateActionPending}
                        className={`text-xs gap-1.5 h-8 ${
                          isDelegate
                            ? "border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10"
                            : "hover:border-primary/40 hover:text-primary"
                        }`}
                        title={isDelegate ? "Révoquer le mandat de délégué" : "Nommer délégué de la classe"}
                      >
                        {isDelegateActionPending ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : isDelegate ? (
                          <UserX size={13} />
                        ) : (
                          <UserCheck size={13} />
                        )}
                        <span>{isDelegate ? "Révoquer" : "Nommer délégué"}</span>
                      </Button>
                    )}

                    {/* Retirer de la classe */}
                    {hasClass && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setRemoveError(null);
                          setStudentToRemove(student);
                        }}
                        className="text-xs gap-1.5 h-8 border-warning/40 text-warning hover:bg-warning/10 hover:text-warning"
                        title="Retirer cet étudiant de sa classe"
                      >
                        <UserMinus size={13} />
                        <span>Retirer de la classe</span>
                      </Button>
                    )}

                    {/* Supprimer définitivement le compte */}
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setDeleteError(null);
                        setStudentToDelete(student);
                      }}
                      className="text-xs gap-1.5 h-8 border-danger/40 text-danger hover:bg-danger/10 hover:text-danger"
                      title="Supprimer définitivement ce compte étudiant"
                    >
                      <Trash2 size={13} />
                      <span className="sm:hidden lg:inline">Supprimer le compte</span>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────
          Modale 1 : Confirmation de retrait d'une classe
          ──────────────────────────────────────────────────────────── */}
      {studentToRemove && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="dialog-remove-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-fade-in"
        >
          <div className="relative w-full max-w-lg rounded-2xl border border-warning/40 bg-card p-6 shadow-card space-y-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-warning/10 text-warning">
                <AlertTriangle size={20} strokeWidth={2} />
              </div>
              <div>
                <h3 id="dialog-remove-title" className="text-base font-bold text-foreground">
                  Retirer l&apos;étudiant de sa classe ?
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Action administrative sur l&apos;appartenance de classe.
                </p>
              </div>
            </div>

            {removeError && (
              <div
                role="alert"
                className="flex items-center gap-2 rounded-xl border border-danger/30 bg-danger/10 p-3 text-xs font-semibold text-danger"
              >
                <AlertCircle size={15} className="shrink-0" />
                <span>{removeError}</span>
              </div>
            )}

            <div className="rounded-xl border border-border/70 bg-muted/30 p-4 space-y-2.5 text-xs text-foreground">
              <p>
                Vous êtes sur le point de retirer{" "}
                <strong className="font-semibold text-foreground">
                  {studentToRemove.firstName} {studentToRemove.lastName}
                </strong>{" "}
                de la classe{" "}
                <strong className="font-semibold text-primary">
                  {studentToRemove.className}
                </strong>
                .
              </p>

              <ul className="list-disc pl-4 space-y-1 text-muted-foreground text-[11px] leading-relaxed">
                <li>
                  L&apos;étudiant perdra immédiatement l&apos;accès aux devoirs, ressources, emploi du temps et chat de cette classe.
                </li>
                {studentToRemove.role === "DELEGATE" && (
                  <li className="text-warning font-medium">
                    Son mandat de <strong>délégué sera automatiquement révoqué</strong> car un délégué doit obligatoirement être membre de sa classe.
                  </li>
                )}
                <li>
                  <strong>Le compte de l&apos;étudiant reste conservé</strong> : il pourra continuer à se connecter et demander à rejoindre une autre classe.
                </li>
                <li>
                  Ses notes, devoirs terminés et messages passés sont préservés dans l&apos;historique académique.
                </li>
              </ul>
            </div>

            <div className="flex justify-end gap-2.5 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setStudentToRemove(null)}
                disabled={isRemoving}
              >
                Annuler
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleConfirmRemove}
                disabled={isRemoving}
                className="bg-warning text-warning-foreground hover:bg-warning/90 gap-1.5"
              >
                {isRemoving ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Retrait en cours...</span>
                  </>
                ) : (
                  <>
                    <UserMinus size={14} />
                    <span>Confirmer le retrait</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────
          Modale 2 : Confirmation de suppression définitive du compte
          ──────────────────────────────────────────────────────────── */}
      {studentToDelete && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="dialog-delete-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-fade-in"
        >
          <div className="relative w-full max-w-lg rounded-2xl border border-danger/40 bg-card p-6 shadow-card space-y-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-danger/10 text-danger">
                <Trash2 size={20} strokeWidth={2} />
              </div>
              <div>
                <h3 id="dialog-delete-title" className="text-base font-bold text-danger">
                  Supprimer définitivement ce compte étudiant ?
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Action destructive irréversible.
                </p>
              </div>
            </div>

            {deleteError && (
              <div
                role="alert"
                className="flex items-center gap-2 rounded-xl border border-danger/30 bg-danger/10 p-3 text-xs font-semibold text-danger"
              >
                <AlertCircle size={15} className="shrink-0" />
                <span>{deleteError}</span>
              </div>
            )}

            <div className="rounded-xl border border-danger/25 bg-danger/5 p-4 space-y-2.5 text-xs text-foreground">
              <p>
                Vous vous apprêtez à supprimer définitivement le compte de{" "}
                <strong className="font-semibold text-foreground">
                  {studentToDelete.firstName} {studentToDelete.lastName}
                </strong>{" "}
                (<code>{studentToDelete.email}</code>).
              </p>

              <div className="rounded-lg bg-background/80 p-3 text-[11px] space-y-1.5 border border-danger/20 text-muted-foreground leading-relaxed">
                <p className="font-semibold text-danger">Conséquences de la suppression :</p>
                <ul className="list-disc pl-4 space-y-1">
                  <li>L&apos;étudiant ne pourra plus jamais se connecter avec cet email.</li>
                  <li>Son compte d&apos;authentification Supabase Auth et son profil seront purgés.</li>
                  <li>Ses données privées (notifications, préférences, complétions, conversations IA) seront définitivement supprimées.</li>
                  <li>
                    Les ressources et devoirs collectifs créés par l&apos;étudiant sont réattribués à l&apos;administration pour préserver le travail des autres élèves.
                  </li>
                </ul>
              </div>
            </div>

            <div className="flex justify-end gap-2.5 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setStudentToDelete(null)}
                disabled={isDeleting}
              >
                Annuler
              </Button>
              <Button
                type="button"
                variant="danger"
                size="sm"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="gap-1.5"
              >
                {isDeleting ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Suppression en cours...</span>
                  </>
                ) : (
                  <>
                    <Trash2 size={14} />
                    <span>Supprimer définitivement</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
