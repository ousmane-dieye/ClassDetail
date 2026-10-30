"use client";

import { useRef, useState } from "react";
import { Plus, Check, AlertCircle } from "lucide-react";
import { createHintAction } from "@/actions/hints";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { toast } from "@/lib/toast";

interface CreateHintFormProps {
  classId: string;
  subjects: Array<{ id: string; name: string }>;
  onSuccess?: () => void;
}

export function CreateHintForm({ classId, subjects, onSuccess }: CreateHintFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, setPending] = useState(false);
  const [justPublished, setJustPublished] = useState(false);
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
      const res = await createHintAction(formData);

      if (res && "error" in res && res.error) {
        setError(res.error);
        toast.error(res.error);
        setPending(false);
        isSubmittingRef.current = false;
        return;
      }

      setJustPublished(true);
      toast.success("Hint / Sujet d'examen publié avec succès.");
      formRef.current?.reset();
      onSuccess?.();

      setTimeout(() => {
        setJustPublished(false);
      }, 3000);
    } catch {
      const msg = "Une erreur est survenue lors de la publication du sujet. Veuillez réessayer.";
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
        placeholder="Titre du sujet (ex: Examen Final Systèmes d'Exploitation)"
        required
        disabled={pending}
        aria-label="Titre du sujet"
      />

      <Select name="subjectId" required defaultValue="" disabled={pending} aria-label="Matière">
        <option value="">Sélectionner une matière</option>
        {subjects.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </Select>

      <Input
        name="year"
        placeholder="Année académique (ex: 2024-2025)"
        required
        disabled={pending}
        aria-label="Année académique"
      />

      <Select name="type" required defaultValue="" disabled={pending} aria-label="Type d'épreuve">
        <option value="">Sélectionner le type (ex: Examen, Devoir...)</option>
        {["DEVOIR", "EXAMEN", "CONTROLE", "TP", "PROJET", "AUTRE"].map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </Select>

      <Input
        name="driveUrl"
        placeholder="Lien Google Drive du sujet / corrigé"
        required
        disabled={pending}
        className="md:col-span-2"
        aria-label="Lien Google Drive"
      />

      <Button
        type="submit"
        isLoading={pending}
        loadingText="Publication en cours…"
        disabled={pending}
        variant={justPublished ? "success" : "default"}
        className="md:col-span-2 gap-2 h-11 text-base font-semibold"
      >
        {justPublished ? (
          <>
            <Check size={18} />
            <span>Hint publié</span>
          </>
        ) : (
          <>
            <Plus size={18} />
            <span>Publier le Hint</span>
          </>
        )}
      </Button>
    </form>
  );
}
