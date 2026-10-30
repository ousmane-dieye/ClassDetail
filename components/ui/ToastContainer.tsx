"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, AlertTriangle, Info, Loader2, X } from "lucide-react";
import { toast, type ToastItem, type ToastType } from "@/lib/toast";

const ICON_MAP: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />,
  error: <AlertTriangle className="h-5 w-5 text-danger shrink-0" />,
  info: <Info className="h-5 w-5 text-info shrink-0" />,
  loading: <Loader2 className="h-5 w-5 text-primary animate-spin shrink-0" />,
};

const BORDER_MAP: Record<ToastType, string> = {
  success: "border-emerald-500/30 bg-card text-foreground shadow-lift",
  error: "border-danger/40 bg-card text-foreground shadow-lift",
  info: "border-info/30 bg-card text-foreground shadow-lift",
  loading: "border-primary/30 bg-card text-foreground shadow-lift",
};

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    const unsubscribe = toast.subscribe(setToasts);
    return () => unsubscribe();
  }, []);

  if (toasts.length === 0) return null;

  return (
    <aside
      aria-label="Notifications"
      aria-live="polite"
      className="fixed z-50 flex flex-col gap-2.5 pointer-events-none top-4 inset-x-4 max-w-sm mx-auto sm:top-auto sm:bottom-5 sm:right-5 sm:left-auto sm:max-w-md w-full"
    >
      {toasts.map((item) => (
        <div
          key={item.id}
          role={item.type === "error" ? "alert" : "status"}
          className={`pointer-events-auto flex items-start gap-3 p-3.5 sm:p-4 rounded-2xl border backdrop-blur-md transition-all duration-200 animate-slide-up ${BORDER_MAP[item.type]}`}
        >
          <div className="mt-0.5">{ICON_MAP[item.type]}</div>
          <div className="flex-1 text-sm font-medium leading-relaxed pr-1 break-words">
            {item.message}
          </div>
          <button
            type="button"
            onClick={() => toast.dismiss(item.id)}
            className="rounded-lg p-1 text-muted-foreground transition-colors hover:text-foreground hover:bg-muted"
            aria-label="Fermer la notification"
          >
            <X size={15} />
          </button>
        </div>
      ))}
    </aside>
  );
}
