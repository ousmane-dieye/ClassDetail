"use client";

import { useState, lazy, Suspense } from "react";
import { Sparkles } from "lucide-react";

const AssistantPanel = lazy(() => import("./AssistantPanel").then((m) => ({ default: m.AssistantPanel })));

export function AssistantFab() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Ouvrir l'Assistant IA ClassPulse"
          title="Assistant IA ClassPulse"
          className="group fixed bottom-6 right-6 z-40 flex items-center gap-2.5 rounded-full bg-primary px-5 py-3.5 text-primary-foreground shadow-lift transition-all duration-200 hover:scale-[1.03] hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 animate-fade-in"
        >
          <span className="relative flex items-center justify-center">
            <Sparkles size={19} strokeWidth={2} className="transition-transform duration-200 group-hover:rotate-12" />
          </span>
          <span className="hidden text-sm font-bold tracking-tight sm:inline">Assistant IA</span>
        </button>
      )}

      {open && (
        <Suspense fallback={null}>
          <AssistantPanel onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </>
  );
}
