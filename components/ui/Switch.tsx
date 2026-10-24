"use client";

import { cn } from "@/lib/utils";

export interface SwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Libellé lisible par les lecteurs d'écran et affiché sous l'interrupteur. */
  id?: string;
  describedBy?: string;
  disabled?: boolean;
  /** État texte affiché (« Activé » / « Désactivé ») — jamais la couleur seule. */
  stateLabel?: string;
}

/**
 * Interrupteur accessible : `<button role="switch" aria-checked>` utilisable
 * au clavier (Tab + Espace/Entrée), avec ÉTAT TEXTE visible à côté de la
 * pastille — l'état n'est jamais différencié uniquement par la couleur.
 */
export function Switch({ checked, onChange, id, describedBy, disabled, stateLabel }: SwitchProps) {
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        id={id}
        role="switch"
        aria-checked={checked}
        aria-describedby={describedBy}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-card",
          "disabled:cursor-not-allowed disabled:opacity-60",
          checked ? "bg-primary" : "bg-muted"
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-subtle transition-transform duration-200",
            checked ? "translate-x-5" : "translate-x-0.5"
          )}
        />
      </button>
      {stateLabel !== undefined && (
        <span
          aria-hidden="true"
          className={cn(
            "min-w-[4.5rem] text-xs font-semibold",
            checked ? "text-primary" : "text-muted-foreground"
          )}
        >
          {stateLabel}
        </span>
      )}
    </span>
  );
}
