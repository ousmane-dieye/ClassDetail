import { Badge } from "@/components/ui/Badge";
import { LucideIcon } from "lucide-react";

interface PageHeaderProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  badge?: string;
  children?: React.ReactNode;
}

/**
 * En-tête de page cohérent pour toutes les sections du tableau de bord.
 * Titre en display, description sobre, badge optionnel, actions à droite.
 */
export function PageHeader({ icon: Icon, title, description, badge, children }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        {Icon && (
          <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-primary shadow-subtle">
            <Icon size={19} strokeWidth={1.75} />
          </div>
        )}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-[1.7rem]">
              {title}
            </h1>
            {badge && <Badge variant="outline" className="shrink-0 text-[11px]">{badge}</Badge>}
          </div>
          {description && (
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p>
          )}
        </div>
      </div>
      {children && <div className="flex shrink-0 items-center gap-2.5">{children}</div>}
    </div>
  );
}
