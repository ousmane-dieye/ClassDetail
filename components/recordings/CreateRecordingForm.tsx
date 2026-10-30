"use client";

import { useRef, useState } from "react";
import { Plus, Check, AlertCircle, Video } from "lucide-react";
import { createRecordingAction } from "@/actions/recordings";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { toast } from "@/lib/toast";

interface CreateRecordingFormProps {
  classId: string;
  subjects: Array<{ id: string; name: string }>;
  onSuccess?: () => void;
}

export function CreateRecordingForm({ classId, subjects, onSuccess }: CreateRecordingFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, setPending] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
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
      const res = await createRecordingAction(formData);

      if (res && "error" in res && res.error) {
        setError(res.error);
        toast.error(res.error);
        setPending(false);
        isSubmittingRef.current = false;
        return;
      }

      // Succès réel confirmé par le serveur
      setJustSaved(true);
      toast.success("Cours ajouté à votre bibliothèque.");
      formRef.current?.reset();
      onSuccess?.();

      setTimeout(() => {
        setJustSaved(false);
      }, 3000);
    } catch {
      const msg = "Une erreur est survenue lors de l'enregistrement du cours. Veuillez réessayer.";
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
        placeholder="Titre de la séance (ex: Cours Algorithmique Avancée)"
        required
        disabled={pending}
        aria-label="Titre de la séance"
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
        name="date"
        type="date"
        required
        disabled={pending}
        aria-label="Date de la séance"
      />

      <Input
        name="driveUrl"
        placeholder="Lien Google Drive de la vidéo"
        required
        disabled={pending}
        aria-label="Lien Google Drive"
      />

      <Textarea
        name="description"
        placeholder="Chapitres et points abordés..."
        className="md:col-span-2"
        disabled={pending}
        aria-label="Description du cours"
      />

      <Button
        type="submit"
        isLoading={pending}
        loadingText="Enregistrement…"
        disabled={pending}
        variant={justSaved ? "success" : "default"}
        className="md:col-span-2 gap-2 h-11 text-base font-semibold"
      >
        {justSaved ? (
          <>
            <Check size={18} />
            <span>Cours enregistré</span>
          </>
        ) : (
          <>
            <Plus size={18} />
            <span>Enregistrer le cours</span>
          </>
        )}
      </Button>
    </form>
  );
}
