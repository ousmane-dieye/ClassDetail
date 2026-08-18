"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { loginAction } from "@/actions/auth";
import { SITE } from "@/lib/constants/images";
import { GraduationCap, ArrowRight, Lock, Mail, AlertCircle, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export function LoginForm() {
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await loginAction(formData);
      if (result && "error" in result) setError(result.error ?? null);
    });
  }

  return (
    <div className="w-full space-y-7">
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
          Bon retour parmi nous
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Connectez-vous pour retrouver le tableau de bord de votre classe.
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
          <label htmlFor="email" className="text-xs font-semibold text-foreground">
            Adresse email
          </label>
          <div className="relative">
            <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" size={17} />
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="etudiant@ecole.fr"
              required
              autoComplete="email"
              className="h-11 pl-10"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="password" className="text-xs font-semibold text-foreground">
              Mot de passe
            </label>
            <Link
              href="/forgot-password"
              className="text-xs font-semibold text-primary hover:text-primary/80 hover:underline underline-offset-2"
            >
              Mot de passe oublié ?
            </Link>
          </div>
          <div className="relative">
            <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" size={17} />
            <Input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              placeholder="••••••••"
              required
              autoComplete="current-password"
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
        </div>

        <Button
          type="submit"
          isLoading={isPending}
          className="w-full h-11 text-base"
        >
          <span>Se connecter</span>
          {!isPending && <ArrowRight size={17} />}
        </Button>

        <p className="pt-1 text-center text-sm text-muted-foreground">
          Pas encore de compte ?{" "}
          <Link href="/register" className="font-semibold text-primary hover:text-primary/80 hover:underline underline-offset-2">
            S&apos;inscrire
          </Link>
        </p>
      </form>
    </div>
  );
}
