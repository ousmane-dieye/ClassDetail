"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { resubmitRegistrationAction } from "@/actions/auth";
import { SITE } from "@/lib/constants/images";
import { GraduationCap, ArrowRight, User, BookOpen, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

export interface ClassOption {
  id: string;
  name: string;
  level: string;
  academic_year: string;
}

export function ResubmitForm({
  classes,
  initialFirstName = "",
  initialLastName = "",
}: {
  classes: ClassOption[];
  initialFirstName?: string;
  initialLastName?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await resubmitRegistrationAction(formData);
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
          Nouvelle demande d&apos;inscription
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Votre précédente demande a été refusée. Vous pouvez soumettre une nouvelle demande :
          elle sera à nouveau vérifiée par un administrateur ou un délégué.
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

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">Prénom</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={15} />
              <Input name="firstName" defaultValue={initialFirstName} placeholder="Amadou" required autoComplete="given-name" className="h-11 pl-9" />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">Nom</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={15} />
              <Input name="lastName" defaultValue={initialLastName} placeholder="Diallo" required autoComplete="family-name" className="h-11 pl-9" />
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-foreground">Votre classe</label>
          <div className="relative">
            <BookOpen className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" size={17} />
            <Select name="classId" required defaultValue="" className="h-11 pl-10">
              <option value="">Sélectionner une classe</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} — {c.level} ({c.academic_year})
                </option>
              ))}
            </Select>
          </div>
        </div>

        <Button type="submit" isLoading={isPending} className="w-full h-11 text-base">
          <span>Soumettre ma demande</span>
          {!isPending && <ArrowRight size={17} />}
        </Button>

        <p className="pt-1 text-center text-sm text-muted-foreground">
          <Link href="/login" className="font-semibold text-primary hover:text-primary/80 hover:underline underline-offset-2">
            Se connecter
          </Link>
        </p>
      </form>
    </div>
  );
}
