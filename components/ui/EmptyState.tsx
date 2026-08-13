import React from "react";
import { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
  imageUrl?: string;
}

/**
 * État vide élégant : illustration douce, titre court, description utile.
 * Jamais de « rien ici » brut — chaque état raconte une petite phrase.
 */
export function EmptyState({ icon: Icon, title, description, action, imageUrl }: EmptyStateProps) {
  return (
    <div className="relative flex flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed border-border bg-card/50 px-6 py-10 text-center sm:p-14">
      {imageUrl ? (
        <div className="relative mb-5 h-28 w-28 overflow-hidden rounded-2xl border border-border shadow-subtle">
          <img
            src={imageUrl}
            alt=""
            className="h-full w-full object-cover opacity-90"
            loading="lazy"
            decoding="async"
          />
          <div className="absolute inset-0 rounded-2xl ring-1 ring-inset ring-black/5" />
        </div>
      ) : Icon ? (
        <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/15 bg-primary/8 text-primary">
          <Icon size={26} strokeWidth={1.75} />
        </div>
      ) : null}

      <h3 className="font-display text-lg font-bold text-foreground">{title}</h3>
      <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted-foreground">
        {description}
      </p>

      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
