"use client";

import { useRef, useState } from "react";
import { Plus, Check, AlertCircle } from "lucide-react";
import { createClassAction } from "@/actions/classes";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { toast } from "@/lib/toast";

export function CreateClassForm({ onSuccess }: { onSuccess?: () => void }) {
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
      const res = await createClassAction(formData);

      if (res && "error" in res && res.error) {
        setError(res.error);
        toast.error(res.error);
        setPending(false);
        isSubmittingRef.current = false;
        return;
      }

      setJustCreated(true);
      toast.success("Classe créée avec succès.");
      formRef.current?.reset();
      onSuccess?.();

      setTimeout(() => {
        setJustCreated(false);
      }, 3000);
    } catch {
      const msg = "Une erreur est survenue lors de la création de la classe.";
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

      <Input
        name="name"
        placeholder="Nom (ex: GL2-A)"
        required
        disabled={pending}
        aria-label="Nom de la classe"
      />
      <Input
        name="level"
        placeholder="Niveau (ex: Licence 2)"
        required
        disabled={pending}
        aria-label="Niveau académique"
      />
      <Input
        name="academicYear"
        placeholder="Année (ex: 2026-2027)"
        required
        disabled={pending}
        aria-label="Année académique"
      />

      <Button
        type="submit"
        isLoading={pending}
        loadingText="Création…"
        disabled={pending}
        variant={justCreated ? "success" : "default"}
        className="w-full gap-1.5"
      >
        {justCreated ? (
          <>
            <Check size={15} />
            <span>Classe créée</span>
          </>
        ) : (
          <>
            <Plus size={15} />
            <span>Créer la classe</span>
          </>
        )}
      </Button>
    </form>
  );
}
