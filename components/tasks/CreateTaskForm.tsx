"use client";

import { useRef, useState } from "react";
import { Plus, Check, AlertCircle } from "lucide-react";
import { createTaskAction } from "@/actions/tasks";
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

interface CreateTaskFormProps {
  classId: string;
  subjects: Array<{ id: string; name: string }>;
  onSuccess?: () => void;
}

export function CreateTaskForm({ classId, subjects, onSuccess }: CreateTaskFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, setPending] = useState(false);
  const [justCreated, setJustCreated] = useState(false);
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
      const res = await createTaskAction(formData);

      if (res && "error" in res && res.error) {
        setError(res.error);
        toast.error(res.error);
        setPending(false);
        isSubmittingRef.current = false;
        return;
      }

      setJustCreated(true);
      toast.success("Tâche créée avec succès.");
      formRef.current?.reset();
      onSuccess?.();

      setTimeout(() => {
        setJustCreated(false);
      }, 3000);
    } catch {
      const msg = "Une erreur est survenue lors de la création de la tâche. Veuillez réessayer.";
      setError(msg);
      toast.error(msg);
    } finally {
      setPending(false);
      isSubmittingRef.current = false;
    }
  };

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2">
      <input type="hidden" name="classId" value={classId} />

      {error && (
        <div
          role="alert"
          className="md:col-span-2 flex items-center gap-2.5 rounded-xl border border-danger/30 bg-danger/10 p-3 text-xs sm:text-sm text-danger animate-fade-in"
        >
          <AlertCircle size={16} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <Input
        name="title"
        placeholder="Titre de la tâche (ex: TP 02 TCP/IP)"
        required
        disabled={pending}
        aria-label="Titre de la tâche"
      />

      <Select name="subjectId" required defaultValue="" disabled={pending} aria-label="Matière">
        <option value="">Sélectionner une matière</option>
        {subjects.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </Select>

      <Select name="type" required defaultValue="" disabled={pending} aria-label="Type de tâche">
        <option value="">Sélectionner le type (ex: Exercice, TP...)</option>
        {TASK_TYPES.map((t) => (
          <option key={t} value={t}>
            {TASK_TYPE_LABELS[t] ?? t}
          </option>
        ))}
      </Select>

      <Input
        name="dueDate"
        type="datetime-local"
        required
        disabled={pending}
        aria-label="Date et heure d'échéance"
      />

      <Input
        name="attachmentLink"
        placeholder="Lien de la ressource (optionnel : Google Drive, OneDrive, GitHub...)"
        className="md:col-span-2"
        disabled={pending}
        aria-label="Lien de pièce jointe"
      />

      <Textarea
        name="description"
        placeholder="Consignes et détails de la tâche..."
        className="md:col-span-2"
        disabled={pending}
        aria-label="Consignes et détails"
      />

      <Button
        type="submit"
        isLoading={pending}
        loadingText="Publication en cours…"
        disabled={pending}
        variant={justCreated ? "success" : "default"}
        className="md:col-span-2 gap-2 h-11 text-base font-semibold"
      >
        {justCreated ? (
          <>
            <Check size={18} />
            <span>Tâche publiée</span>
          </>
        ) : (
          <>
            <Plus size={18} />
            <span>Publier la tâche</span>
          </>
        )}
      </Button>
    </form>
  );
}
