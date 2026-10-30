"use client";

import { useTransition } from "react";
import { toggleTaskCompletionAction } from "@/actions/tasks";
import {
  CheckCircle2,
  Clock,
  ExternalLink,
  Paperclip,
  AlertTriangle,
  Flame,
  CheckCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent } from "@/components/ui/Card";

export interface TaskItem {
  id: string;
  title: string;
  description: string | null;
  due_date: string;
  type: string;
  attachment_link: string | null;
  is_expired: boolean;
}

const TYPE_LABEL: Record<string, string> = {
  EXERCISE: "Exercice",
  TP: "TP",
  ASSIGNMENT: "Devoir",
  RESEARCH: "Recherche",
  PROJECT: "Projet",
  OTHER: "Autre",
};

function getDueInfo(dueDateStr: string, isCompleted: boolean) {
  if (isCompleted) {
    return {
      badge: <Badge variant="success"><CheckCheck size={11} /> Terminé</Badge>,
      urgency: "none" as const,
    };
  }

  const due = new Date(dueDateStr);
  const now = new Date();
  const diffMs = due.getTime() - now.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);

  if (diffMs < 0) {
    return {
      badge: <Badge variant="danger">Expiré</Badge>,
      urgency: "expired" as const,
    };
  } else if (diffHours <= 24) {
    return {
      badge: (
        <Badge variant="danger" className="animate-pulse-subtle gap-1">
          <Flame size={10} />
          {Math.ceil(diffHours)}h restantes
        </Badge>
      ),
      urgency: "critical" as const,
    };
  } else if (diffHours <= 48) {
    return {
      badge: (
        <Badge variant="danger" className="gap-1">
          <AlertTriangle size={10} />
          {Math.ceil(diffHours / 24)}j restant(s)
        </Badge>
      ),
      urgency: "urgent" as const,
    };
  } else {
    const days = Math.ceil(diffHours / 24);
    return {
      badge: <Badge variant="info">J-{days}</Badge>,
      urgency: "normal" as const,
    };
  }
}

import { toast } from "@/lib/toast";

export function TaskCard({ task, completed }: { task: TaskItem; completed: boolean }) {
  const [isPending, startTransition] = useTransition();

  function handleToggle() {
    if (isPending) return;
    startTransition(async () => {
      try {
        const res = await toggleTaskCompletionAction(task.id, !completed);
        if (res && "error" in res && res.error) {
          toast.error(res.error);
        } else {
          toast.success(
            completed
              ? "Tâche marquée comme à faire."
              : "Tâche marquée comme terminée."
          );
        }
      } catch {
        toast.error("Une erreur est survenue lors de la mise à jour de la tâche.");
      }
    });
  }

  const formattedDate = new Date(task.due_date).toLocaleString("fr-FR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  const { badge, urgency } = getDueInfo(task.due_date, completed);

  const urgencyBorderClass = {
    critical: "border-l-4 border-l-danger",
    urgent: "border-l-4 border-l-warning",
    expired: "border-l-4 border-l-muted-foreground",
    normal: "",
    none: "",
  }[urgency];

  return (
    <Card
      className={`group transition-all duration-200 hover:shadow-lift ${
        completed ? "opacity-70 bg-muted/30" : "bg-card"
      } ${urgencyBorderClass}`}
    >
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start gap-3 sm:gap-4">
          {/* Completion checkbox */}
          <button
            type="button"
            onClick={handleToggle}
            disabled={isPending}
            className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border-2 transition-all duration-200 ${
              isPending ? "animate-pulse-subtle" : ""
            } ${
              completed
                ? "border-success bg-success text-white"
                : "border-border hover:border-primary hover:bg-primary/8"
            }`}
            aria-label={completed ? "Marquer comme non terminé" : "Marquer comme terminé"}
          >
            {completed && <CheckCircle2 size={14} strokeWidth={2.5} />}
          </button>

          {/* Task info */}
          <div className="flex-1 space-y-2 overflow-hidden">
            {/* Title + badges */}
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h3
                className={`text-sm font-bold sm:text-base leading-snug transition-colors ${
                  completed ? "line-through text-muted-foreground" : "text-foreground"
                }`}
              >
                {task.title}
              </h3>
              <div className="flex items-center gap-1.5 shrink-0">
                <Badge variant="outline" className="text-[10px] font-semibold">
                  {TYPE_LABEL[task.type] ?? task.type}
                </Badge>
                {badge}
              </div>
            </div>

            {/* Description */}
            {task.description && (
              <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                {task.description}
              </p>
            )}

            {/* Footer row */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock size={12} strokeWidth={1.75} />
                <span>Pour le {formattedDate}</span>
              </div>

              {task.attachment_link && (
                <a
                  href={task.attachment_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline underline-offset-2"
                >
                  <Paperclip size={11} />
                  <span>Pièce jointe</span>
                  <ExternalLink size={10} />
                </a>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
