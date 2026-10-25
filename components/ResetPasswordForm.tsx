"use client";

import { useState, useTransition } from "react";
import { updatePasswordAction } from "@/actions/auth";
import { SITE } from "@/lib/constants/images";
import { PASSWORD_MIN_LENGTH } from "@/lib/constants/password";
import { GraduationCap, ArrowRight, Lock, AlertCircle, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export function ResetPasswordForm() {
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await updatePasswordAction(formData);
      if (result && "error" in result) setError(result.error ?? null);
    });
  }

  return (
    <div className="w-full space-y-6">
      {/* Marque & accroche */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-subtle">
            <GraduationCap size={22} />
          </div>
          <div>
            <p className="font-display text-xl font-bold tracking-tight text-foreground">{SITE.name}</p>
            <p className="text-xs font-medium text-muted-foreground">{SITE.tagline}</p>
          </div>
        </div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Nouveau mot de passe
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Votre identité a été vérifiée. Choisissez un nouveau mot de passe, puis reconnectez-vous.
        </p>
      </div>

      {/* Formulaire */}
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div
            role="alert"
            className="flex items-center gap-2.5 rounded-xl border border-danger/30 bg-danger/8 p-3.5 text-sm text-danger animate-fade-in"
          >
            <AlertCircle size={18} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="space-y-1.5">
          <label htmlFor="password" className="text-xs font-semibold text-foreground">
            Nouveau mot de passe
          </label>
          <div className="relative">
            <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" size={17} />
            <Input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              placeholder={`${PASSWORD_MIN_LENGTH} caractères minimum`}
              required
              minLength={PASSWORD_MIN_LENGTH}
              autoComplete="new-password"
              className="h-11 pl-10 pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
              className="absolute right-3 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            {PASSWORD_MIN_LENGTH} caractères minimum, et différent de votre ancien mot de passe.
          </p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="confirmPassword" className="text-xs font-semibold text-foreground">
            Confirmer le nouveau mot de passe
          </label>
          <div className="relative">
            <ShieldCheck className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" size={17} />
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type={showPassword ? "text" : "password"}
              placeholder="Retapez votre mot de passe"
              required
              minLength={PASSWORD_MIN_LENGTH}
              autoComplete="new-password"
              className="h-11 pl-10"
            />
          </div>
        </div>

        <Button type="submit" isLoading={isPending} className="w-full h-11 text-base">
          <span>Mettre à jour le mot de passe</span>
          {!isPending && <ArrowRight size={17} />}
        </Button>
      </form>
    </div>
  );
}
