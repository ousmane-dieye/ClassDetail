"use client";

import { useRef, useState } from "react";
import { Plus, Check, AlertCircle } from "lucide-react";
import { createDocumentAction } from "@/actions/documents";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { toast } from "@/lib/toast";

interface CreateDocumentFormProps {
  classId: string;
  subjects: Array<{ id: string; name: string }>;
  onSuccess?: () => void;
}

export function CreateDocumentForm({ classId, subjects, onSuccess }: CreateDocumentFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, setPending] = useState(false);
  const [justAdded, setJustAdded] = useState(false);
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
      const res = await createDocumentAction(formData);

      if (res && "error" in res && res.error) {
        setError(res.error);
        toast.error(res.error);
        setPending(false);
        isSubmittingRef.current = false;
        return;
      }

      setJustAdded(true);
      toast.success("Document ajouté avec succès.");
      formRef.current?.reset();
      onSuccess?.();

      setTimeout(() => {
        setJustAdded(false);
      }, 3000);
    } catch {
      const msg = "Une erreur est survenue lors de l'ajout du document. Veuillez réessayer.";
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
        placeholder="Titre du document (ex: Polycopié Chapitre 3 - TCP/IP)"
        required
        disabled={pending}
        aria-label="Titre du document"
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
        name="driveUrl"
        placeholder="Lien Google Drive du fichier"
        required
        disabled={pending}
        className="md:col-span-2"
        aria-label="Lien Google Drive"
      />

      <Textarea
        name="description"
        placeholder="Description courte (optionnel)"
        className="md:col-span-2"
        disabled={pending}
        aria-label="Description"
      />

      <Button
        type="submit"
        isLoading={pending}
        loadingText="Ajout en cours…"
        disabled={pending}
        variant={justAdded ? "success" : "default"}
        className="md:col-span-2 gap-2 h-11 text-base font-semibold"
      >
        {justAdded ? (
          <>
            <Check size={18} />
            <span>Document ajouté</span>
          </>
        ) : (
          <>
            <Plus size={18} />
            <span>Ajouter le document</span>
          </>
        )}
      </Button>
    </form>
  );
}
