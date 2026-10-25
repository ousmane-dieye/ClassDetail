"use client";

import { useId, useState, useTransition } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  LogOut,
  Mail,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardContent } from "@/components/ui/Card";
import { changePasswordInDashboardAction } from "@/actions/profile";
import { logoutAction } from "@/actions/auth";

/* ──────────────────────────────────────────────────────────────────
   Types
   ────────────────────────────────────────────────────────────────── */

export type AccountData = {
  email: string;
  createdAt: string | null;
  lastSignInAt: string | null;
  emailConfirmedAt: string | null;
};

type PasswordRule = {
  label: string;
  test: (pwd: string) => boolean;
};

const PASSWORD_RULES: PasswordRule[] = [
  { label: "8 caractères minimum", test: (p) => p.length >= 8 },
  { label: "Au moins une lettre majuscule", test: (p) => /[A-Z]/.test(p) },
  { label: "Au moins un chiffre (0-9)", test: (p) => /[0-9]/.test(p) },
];

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* ──────────────────────────────────────────────────────────────────
   Composant principal
   ────────────────────────────────────────────────────────────────── */

export function AccountSection({ account }: { account: AccountData }) {
  // Changement de mot de passe
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [isChangingPassword, startPasswordChange] = useTransition();

  // Déconnexion
  const [isLoggingOut, startLogout] = useTransition();

  const pwdId = useId();
  const confirmPwdId = useId();

  // Évaluation de la robustesse
  const rulesMet = PASSWORD_RULES.map((r) => r.test(password));
  const allRulesMet = rulesMet.every(Boolean);
  const passwordsMatch = confirmPassword.length > 0 && password === confirmPassword;
  const strengthScore = rulesMet.filter(Boolean).length;

  const strengthColor =
    strengthScore === 3
      ? "bg-emerald-500"
      : strengthScore === 2
      ? "bg-amber-500"
      : strengthScore === 1
      ? "bg-orange-500"
      : "bg-muted";

  const strengthLabel =
    strengthScore === 3
      ? "Fort"
      : strengthScore === 2
      ? "Moyen"
      : strengthScore === 1
      ? "Faible"
      : "Insuffisant";

  async function handlePasswordSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(false);

    if (!allRulesMet) {
      setPasswordError("Le mot de passe ne respecte pas tous les critères de sécurité.");
      return;
    }

    if (password !== confirmPassword) {
      setPasswordError("Les mots de passe saisis ne sont pas identiques.");
      return;
    }

    const formData = new FormData();
    formData.append("password", password);
    formData.append("confirmPassword", confirmPassword);

    startPasswordChange(async () => {
      const result = await changePasswordInDashboardAction(formData);
      if ("error" in result) {
        setPasswordError(result.error);
      } else {
        setPasswordSuccess(true);
        setPassword("");
        setConfirmPassword("");
      }
    });
  }

  function handleLogout() {
    if (confirm("Voulez-vous vraiment vous déconnecter de ClassPulse ?")) {
      startLogout(async () => {
        await logoutAction();
      });
    }
  }

  return (
    <div className="space-y-8">
      {/* ────────────────────────────────────────────────────────────
          1. Informations de session et identité
          ──────────────────────────────────────────────────────────── */}
      <section aria-labelledby="section-account-info" className="space-y-3">
        <div className="flex items-center gap-2">
          <Mail size={16} className="text-primary" />
          <h2 id="section-account-info" className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
            Identifiants & Connexion
          </h2>
        </div>

        <Card hoverEffect={false} className="overflow-hidden border-border/80">
          <CardContent className="p-0 divide-y divide-border/60">
            <div className="flex flex-col gap-2 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <dt className="text-xs font-semibold text-muted-foreground">Adresse e-mail du compte</dt>
                <dd className="mt-1 flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{account.email}</span>
                  {account.emailConfirmedAt ? (
                    <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                      <Check size={12} strokeWidth={2.5} />
                      Vérifié
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                      En attente de confirmation
                    </span>
                  )}
                </dd>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Utilisée pour la connexion et les réceptions de notifications importantes.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <dt className="text-xs font-semibold text-muted-foreground">Date de création du compte</dt>
                <dd className="mt-1 text-sm text-foreground">{formatDate(account.createdAt)}</dd>
              </div>
            </div>

            {account.lastSignInAt && (
              <div className="flex flex-col gap-2 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <dt className="text-xs font-semibold text-muted-foreground">Dernière activité enregistrée</dt>
                  <dd className="mt-1 text-sm text-foreground">{formatDate(account.lastSignInAt)}</dd>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {/* ────────────────────────────────────────────────────────────
          2. Modification du mot de passe
          ──────────────────────────────────────────────────────────── */}
      <section aria-labelledby="section-password" className="space-y-3">
        <div className="flex items-center gap-2">
          <KeyRound size={16} className="text-primary" />
          <h2 id="section-password" className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
            Sécurité du mot de passe
          </h2>
        </div>

        <Card hoverEffect={false} className="border-border/80">
          <CardContent className="p-6">
            <form onSubmit={handlePasswordSubmit} className="space-y-5">
              {passwordSuccess && (
                <div
                  role="status"
                  className="flex items-start gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-xs font-medium text-emerald-700 dark:text-emerald-300"
                >
                  <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <div>
                    <p className="font-semibold">Mot de passe mis à jour avec succès !</p>
                    <p className="mt-0.5 text-[11px] opacity-90">
                      Vos prochaines connexions devront utiliser ce nouveau mot de passe. Votre session actuelle reste active.
                    </p>
                  </div>
                </div>
              )}

              {passwordError && (
                <div
                  role="alert"
                  className="flex items-start gap-3 rounded-xl border border-danger/30 bg-danger/10 p-4 text-xs font-medium text-danger"
                >
                  <AlertCircle size={16} className="mt-0.5 shrink-0" />
                  <p>{passwordError}</p>
                </div>
              )}

              {/* Nouveau mot de passe */}
              <div className="space-y-1.5">
                <label htmlFor={pwdId} className="block text-xs font-semibold text-foreground">
                  Nouveau mot de passe
                </label>
                <div className="relative">
                  <Input
                    id={pwdId}
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setPasswordSuccess(false);
                      setPasswordError(null);
                    }}
                    placeholder="••••••••••••"
                    autoComplete="new-password"
                    disabled={isChangingPassword}
                    className="pr-10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition hover:text-foreground"
                    aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>

                {/* Barre de robustesse */}
                {password.length > 0 && (
                  <div className="space-y-2 pt-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Force du mot de passe</span>
                      <span className="font-semibold text-foreground">{strengthLabel}</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden flex gap-1">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${strengthColor}`}
                        style={{ width: `${(strengthScore / 3) * 100}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Confirmation du mot de passe */}
              <div className="space-y-1.5">
                <label htmlFor={confirmPwdId} className="block text-xs font-semibold text-foreground">
                  Confirmer le nouveau mot de passe
                </label>
                <div className="relative">
                  <Input
                    id={confirmPwdId}
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      setPasswordSuccess(false);
                      setPasswordError(null);
                    }}
                    placeholder="••••••••••••"
                    autoComplete="new-password"
                    disabled={isChangingPassword}
                    className="pr-10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition hover:text-foreground"
                    aria-label={showConfirmPassword ? "Masquer la confirmation" : "Afficher la confirmation"}
                  >
                    {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* Liste des critères */}
              <div className="rounded-xl border border-border/60 bg-muted/30 p-3.5 space-y-2">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Exigences de sécurité
                </p>
                <ul className="space-y-1.5 text-xs">
                  {PASSWORD_RULES.map((rule, idx) => {
                    const met = rulesMet[idx];
                    return (
                      <li key={rule.label} className="flex items-center gap-2 text-muted-foreground">
                        <span
                          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] ${
                            met ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-bold" : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {met ? <Check size={11} strokeWidth={3} /> : "•"}
                        </span>
                        <span className={met ? "text-foreground font-medium" : ""}>{rule.label}</span>
                      </li>
                    );
                  })}
                  <li className="flex items-center gap-2 text-muted-foreground">
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] ${
                        passwordsMatch
                          ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-bold"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {passwordsMatch ? <Check size={11} strokeWidth={3} /> : "•"}
                    </span>
                    <span className={passwordsMatch ? "text-foreground font-medium" : ""}>
                      Les deux mots de passe correspondent
                    </span>
                  </li>
                </ul>
              </div>

              <div className="flex justify-end pt-2">
                <Button
                  type="submit"
                  disabled={isChangingPassword || !allRulesMet || !passwordsMatch}
                  className="w-full sm:w-auto"
                >
                  {isChangingPassword ? (
                    <>
                      <Loader2 size={15} className="animate-spin mr-2" />
                      Mise à jour en cours...
                    </>
                  ) : (
                    <>
                      <Lock size={15} className="mr-2" />
                      Mettre à jour le mot de passe
                    </>
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </section>

      {/* ────────────────────────────────────────────────────────────
          3. Bonnes pratiques de sécurité
          ──────────────────────────────────────────────────────────── */}
      <section aria-labelledby="section-security-tips" className="space-y-3">
        <div className="flex items-center gap-2">
          <ShieldCheck size={16} className="text-primary" />
          <h2 id="section-security-tips" className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
            Recommandations de sécurité académique
          </h2>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex items-start gap-3 rounded-2xl border border-border/70 bg-card p-4">
            <Shield size={18} className="mt-0.5 shrink-0 text-primary" />
            <div>
              <p className="text-xs font-bold text-foreground">Postes publics & partagés</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                Déconnectez-vous toujours de votre session lorsque vous travaillez sur les ordinateurs de la bibliothèque ou des salles de TP.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-2xl border border-border/70 bg-card p-4">
            <Sparkles size={18} className="mt-0.5 shrink-0 text-amber-500" />
            <div>
              <p className="text-xs font-bold text-foreground">Identifiants confidentiels</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                Ne partagez jamais vos identifiants avec d&apos;autres camarades. Chaque étudiant doit disposer de son propre compte nominatif.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ────────────────────────────────────────────────────────────
          4. Zone de session & Déconnexion
          ──────────────────────────────────────────────────────────── */}
      <section aria-labelledby="section-session" className="space-y-3 pt-2">
        <div className="flex items-center gap-2">
          <LogOut size={16} className="text-danger" />
          <h2 id="section-session" className="text-sm font-bold uppercase tracking-wider text-danger">
            Session active
          </h2>
        </div>

        <Card hoverEffect={false} className="border-danger/30 bg-danger/5">
          <CardContent className="p-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">Fermer la session sur cet appareil</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Vous serez redirigé vers la page de connexion. Vos devoirs et documents resteront sauvegardés.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="shrink-0 border-danger/40 text-danger hover:bg-danger/10 hover:text-danger"
            >
              {isLoggingOut ? (
                <>
                  <Loader2 size={15} className="animate-spin mr-2" />
                  Déconnexion...
                </>
              ) : (
                <>
                  <LogOut size={15} className="mr-2" />
                  Se déconnecter
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
