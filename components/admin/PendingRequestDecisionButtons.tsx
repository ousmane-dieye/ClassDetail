"use client";

import { useState, useTransition } from "react";
import { Check, X } from "lucide-react";
import { decideRegistrationAction } from "@/actions/auth";
import { Button } from "@/components/ui/Button";
import { toast } from "@/lib/toast";

interface Props {
  requestId: string;
  studentName: string;
}

export function PendingRequestDecisionButtons({ requestId, studentName }: Props) {
  const [pendingAction, setPendingAction] = useState<"ACCEPTED" | "REJECTED" | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleDecision = (decision: "ACCEPTED" | "REJECTED") => {
    if (isPending || pendingAction) return;
    setPendingAction(decision);

    startTransition(async () => {
      try {
        const res = await decideRegistrationAction(requestId, decision);
        if (res && "error" in res && res.error) {
          toast.error(res.error);
        } else {
          if (decision === "ACCEPTED") {
            toast.success(`Demande de ${studentName} acceptée avec succès.`);
          } else {
            toast.info(`Demande de ${studentName} refusée.`);
          }
        }
      } catch {
        toast.error("Une erreur est survenue lors du traitement de la demande.");
      } finally {
        setPendingAction(null);
      }
    });
  };

  const busy = isPending || pendingAction !== null;

  return (
    <div className="flex items-center gap-2 sm:shrink-0">
      <Button
        size="sm"
        variant="success"
        className="gap-1.5"
        disabled={busy}
        isLoading={pendingAction === "ACCEPTED"}
        loadingText="Traitement…"
        onClick={() => handleDecision("ACCEPTED")}
        aria-label={`Accepter la demande de ${studentName}`}
      >
        <Check size={13} />
        <span>Accepter</span>
      </Button>

      <Button
        size="sm"
        variant="danger"
        className="gap-1.5"
        disabled={busy}
        isLoading={pendingAction === "REJECTED"}
        loadingText="Traitement…"
        onClick={() => handleDecision("REJECTED")}
        aria-label={`Refuser la demande de ${studentName}`}
      >
        <X size={13} />
        <span>Refuser</span>
      </Button>
    </div>
  );
}
