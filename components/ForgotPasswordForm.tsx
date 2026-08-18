"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { requestPasswordResetAction } from "@/actions/auth";
import { SITE } from "@/lib/constants/images";
import { GraduationCap, ArrowLeft, Mail, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export function ForgotPasswordForm() {
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await requestPasswordResetAction(formData);
      if (result && "error" in result) {
        setError(result.error ?? null);
        return;
      }
      // Message NEUTRE, identique que le compte existe ou non (anti-énumération).
      setSent(true);
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
          Mot de passe oublié
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Saisissez l&apos;adresse email de votre compte : nous vous enverrons un lien pour
          choisir un nouveau mot de passe.
        </p>
      </div>

      {sent ? (
        <div
          role="status"
          className="flex items-start gap-2.5 rounded-xl border border-success/30 bg-success/8 p-3.5 text-sm text-success animate-fade-in"
        >
          <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
          <div className="space-y-1">
            <p className="font-semibold">Vérifiez votre boîte de réception</p>
            <p className="text-foreground/80">
              Si un compte existe avec cette adresse, un email de récupération vient d&apos;être
              envoyé. Le lien est valable quelques minutes.
            </p>
          </div>
        </div>
      ) : (
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

          <Button type="submit" isLoading={isPending} className="w-full h-11 text-base">
            <span>Envoyer le lien de récupération</span>
          </Button>
        </form>
      )}

      <p className="pt-1 text-center text-sm text-muted-foreground">
        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 font-semibold text-primary hover:text-primary/80 hover:underline underline-offset-2"
        >
          <ArrowLeft size={14} />
          <span>Retour à la connexion</span>
        </Link>
      </p>
    </div>
  );
}
