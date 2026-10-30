"use client";

import { useRef, useState } from "react";
import { Check, AlertCircle } from "lucide-react";
import { updateTaskAction } from "@/actions/tasks";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { toast } from "@/lib/toast";

const TASK_TYPES = ["EXERCISE", "TP", "ASSIGNMENT", "RESEARCH", "PROJECT", "OTHER"];

const TASK_TYPE_LABELS: Record<string, string> = {
  EXERCISE: "Exercice",
  TP: "TP",
  ASSIGNMENT: "Devoir",
  RESEARCH: "Recherche",
  PROJECT: "Projet",
  OTHER: "Autre",
};

function toDateTimeLocal(date: string): string {
  const d = new Date(date);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface EditTaskFormProps {
  task: {
    id: string;
    class_id: string;
    title: string;
    subject_id: string;
    type: string;
    due_date: string;
    attachment_link: string | null;
    description: string | null;
  };
  subjects: Array<{ id: string; name: string }>;
  onSuccess?: () => void;
}

export function EditTaskForm({ task, subjects, onSuccess }: EditTaskFormProps) {
  const [pending, setPending] = useState(false);
  const [justUpdated, setJustUpdated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isSubmittingRef = useRef(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isSubmittingRef.current || pending) return;
    isSubmittingRef.current = true;
    setPending(true);
    setError(null);

    try {
      const formData = new FormData(e.currentTarget);
      const res = await updateTaskAction(formData);

      if (res && "error" in res && res.error) {
        setError(res.error);
        toast.error(res.error);
        setPending(false);
        isSubmittingRef.current = false;
        return;
      }

      setJustUpdated(true);
      toast.success("Modifications enregistrées.");
      onSuccess?.();

      setTimeout(() => {
        setJustUpdated(false);
      }, 3000);
    } catch {
      const msg = "Une erreur est survenue lors de la mise à jour de la tâche. Veuillez réessayer.";
      setError(msg);
      toast.error(msg);
    } finally {
      setPending(false);
      isSubmittingRef.current = false;
    }
  };

  return (
    <form onSubmit={handleSubmit} className="grid gap-3 md:grid-cols-2">
      <input type="hidden" name="taskId" value={task.id} />
      <input type="hidden" name="classId" value={task.class_id} />

      {error && (
        <div
          role="alert"
          className="md:col-span-2 flex items-center gap-2 rounded-xl border border-danger/30 bg-danger/10 p-2.5 text-xs text-danger animate-fade-in"
        >
          <AlertCircle size={15} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <Input
        name="title"
        defaultValue={task.title}
        required
        disabled={pending}
        placeholder="Titre de la tâche"
        aria-label="Titre de la tâche"
      />

      <Select name="subjectId" required defaultValue={task.subject_id} disabled={pending} aria-label="Matière">
        {subjects.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </Select>

      <Select name="type" required defaultValue={task.type} disabled={pending} aria-label="Type de tâche">
        {TASK_TYPES.map((type) => (
          <option key={type} value={type}>
            {TASK_TYPE_LABELS[type] ?? type}
          </option>
        ))}
      </Select>

      <Input
        name="dueDate"
        type="datetime-local"
        defaultValue={toDateTimeLocal(task.due_date)}
        required
        disabled={pending}
        aria-label="Date d'échéance"
      />

      <Input
        name="attachmentLink"
        defaultValue={task.attachment_link ?? ""}
        placeholder="Lien de la ressource (Google Drive, OneDrive, GitHub...)"
        className="md:col-span-2"
        disabled={pending}
        aria-label="Lien de ressource"
      />

      <Textarea
        name="description"
        defaultValue={task.description ?? ""}
        placeholder="Description"
        className="md:col-span-2"
        disabled={pending}
        aria-label="Description"
      />

      <Button
        type="submit"
        isLoading={pending}
        loadingText="Enregistrement…"
        disabled={pending}
        variant={justUpdated ? "success" : "default"}
        className="md:col-span-2 gap-2"
      >
        {justUpdated ? (
          <>
            <Check size={16} />
            <span>Modifications enregistrées</span>
          </>
        ) : (
          <span>Enregistrer les modifications</span>
        )}
      </Button>
    </form>
  );
}
