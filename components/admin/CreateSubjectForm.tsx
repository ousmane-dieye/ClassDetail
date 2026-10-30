"use client";

import { useRef, useState } from "react";
import { Plus, Check, AlertCircle } from "lucide-react";
import { createSubjectAction } from "@/actions/classes";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { SUBJECT_COLOR_KEYS, getSubjectColor } from "@/lib/constants/subjectColors";
import { toast } from "@/lib/toast";

interface CreateSubjectFormProps {
  classes: Array<{ id: string; name: string; level: string }>;
  onSuccess?: () => void;
}

export function CreateSubjectForm({ classes, onSuccess }: CreateSubjectFormProps) {
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
      const res = await createSubjectAction(formData);

      if (res && "error" in res && res.error) {
        setError(res.error);
        toast.error(res.error);
        setPending(false);
        isSubmittingRef.current = false;
        return;
      }

      setJustAdded(true);
      toast.success("Matière ajoutée avec succès.");
      formRef.current?.reset();
      onSuccess?.();

      setTimeout(() => {
        setJustAdded(false);
      }, 3000);
    } catch {
      const msg = "Une erreur est survenue lors de l'ajout de la matière.";
      setError(msg);
      toast.error(msg);
    } finally {
      setPending(false);
      isSubmittingRef.current = false;
    }
  };

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-3">
      {error && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-xl border border-danger/30 bg-danger/10 p-2.5 text-xs text-danger animate-fade-in"
        >
          <AlertCircle size={15} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-foreground">Classe concernée</label>
        <Select name="classId" required defaultValue="" disabled={pending} aria-label="Classe concernée">
          <option value="">Sélectionner une classe</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} — {c.level}
            </option>
          ))}
        </Select>
      </div>

      <Input
        name="name"
        placeholder="Nom de la matière (ex: Algorithmique)"
        required
        disabled={pending}
        aria-label="Nom de la matière"
      />

      <Input
        name="code"
        placeholder="Code optionnel (ex: CS201)"
        disabled={pending}
        aria-label="Code de la matière"
      />

      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-foreground">Couleur distinctive (optionnelle)</label>
        <Select name="colorKey" defaultValue="" disabled={pending} aria-label="Couleur distinctive">
          <option value="">Automatique (harmonieuse sans doublon)</option>
          {SUBJECT_COLOR_KEYS.map((k) => (
            <option key={k} value={k}>
              {getSubjectColor(k).label}
            </option>
          ))}
        </Select>
      </div>

      <Button
        type="submit"
        isLoading={pending}
        loadingText="Ajout en cours…"
        disabled={pending}
        variant={justAdded ? "success" : "default"}
        className="w-full gap-1.5"
      >
        {justAdded ? (
          <>
            <Check size={15} />
            <span>Matière ajoutée</span>
          </>
        ) : (
          <>
            <Plus size={15} />
            <span>Ajouter la matière</span>
          </>
        )}
      </Button>
    </form>
  );
}
