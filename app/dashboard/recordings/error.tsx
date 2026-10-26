"use client";

/**
 * Erreur de la page « Cours enregistrés » : l'utilisateur garde un chemin de
 * retour clair (jamais une page blanche). Même mécanisme que la page
 * Évaluations (boundary de route).
 */

import { useEffect } from "react";
import Link from "next/link";
import { RotateCcw, Video } from "lucide-react";

import { Button } from "@/components/ui/Button";

export default function RecordingsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Journalisation discrète : aucun sensible, message seul.
    console.error("recordings-page-error", error.message);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center animate-fade-in">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-danger/30 bg-danger/8 text-danger">
        <Video size={24} strokeWidth={1.75} />
      </div>
      <div>
        <h1 className="text-xl font-bold text-foreground">
          Les cours enregistrés n&apos;ont pas pu être chargés
        </h1>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          Le service est momentanément indisponible. Réessayez dans un instant,
          vos données restent intactes.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button type="button" onClick={reset} className="gap-2">
          <RotateCcw size={15} />
          Réessayer
        </Button>
        <Link
          href="/dashboard"
          className="rounded-xl border border-border px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-muted"
        >
          Retour à l&apos;accueil
        </Link>
      </div>
    </div>
  );
}
