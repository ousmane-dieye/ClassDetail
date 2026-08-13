"use client";

import { useState, useTransition } from "react";
import { sendTestEmailAction } from "@/actions/emails";

interface TestStep {
  ok: boolean;
  label: string;
  detail?: string;
}

export function EmailTestForm() {
  const [steps, setSteps] = useState<TestStep[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSteps(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await sendTestEmailAction(formData);
      if (result.ok) setSteps(result.steps ?? []);
      else setError(result.error ?? "Échec inconnu");
    });
  }

  return (
    <div className="rounded-lg border border-border p-4">
      <h2 className="mb-1 text-lg font-semibold">Email de test</h2>
      <p className="mb-3 text-sm text-muted-foreground">
        Vérifie la connexion SMTP et envoie un email depuis l'adresse de l&apos;administration.
      </p>

      <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-2">
        <input
          name="to"
          type="email"
          placeholder="Adresse autorisée (optionnel, défaut : email admin)"
          className="rounded-md border border-border bg-background text-foreground px-3 py-2"
        />
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-60"
        >
          {isPending ? "Envoi…" : "Envoyer un email de test"}
        </button>
      </form>

      {error && (
        <p role="alert" className="mt-3 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          ✗ {error}
        </p>
      )}

      {steps && steps.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm">
          {steps.map((step, i) => (
            <li key={i} className={step.ok ? "text-success" : "text-danger"}>
              {step.ok ? "✓" : "✗"} {step.label}
              {step.detail ? <span className="text-muted-foreground"> — {step.detail}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
