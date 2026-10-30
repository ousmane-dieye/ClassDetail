"use client";

import { useMemo, useState, useTransition } from "react";
import {
  AlertCircle,
  Bell,
  BellOff,
  Check,
  ClipboardCheck,
  CalendarDays,
  FileText,
  MessageSquare,
  RotateCcw,
  Send,
  Sparkles,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Switch } from "@/components/ui/Switch";
import { Badge } from "@/components/ui/Badge";
import {
  CATEGORY_META,
  DEFAULT_CHANNELS,
  NOTIFICATION_PREFERENCE_CATEGORIES,
  type Channels,
  type PreferenceCategory,
} from "@/lib/constants/notificationPreferences";
import {
  resetNotificationPreferencesAction,
  saveNotificationPreferencesAction,
} from "@/actions/notification-preferences";
import { toast } from "@/lib/toast";

type PreferenceState = Record<PreferenceCategory, Channels>;

const CATEGORY_ICON: Record<PreferenceCategory, LucideIcon> = {
  ASSIGNMENTS: ClipboardCheck,
  ASSIGNMENT_REMINDERS: Bell,
  EVALUATIONS: FileText,
  SCHEDULE: CalendarDays,
  ANNOUNCEMENTS: Sparkles,
  RESOURCES: Send,
  CHAT: MessageSquare,
};

function sameState(a: PreferenceState, b: PreferenceState): boolean {
  return NOTIFICATION_PREFERENCE_CATEGORIES.every(
    (category) => a[category].inApp === b[category].inApp && a[category].email === b[category].email
  );
}

function toPayload(state: PreferenceState) {
  return {
    preferences: NOTIFICATION_PREFERENCE_CATEGORIES.map((category) => ({
      category,
      inAppEnabled: state[category].inApp,
      emailEnabled: state[category].email,
    })),
  };
}

export function NotificationPreferencesForm({ initial }: { initial: PreferenceState }) {
  const [values, setValues] = useState<PreferenceState>(initial);
  const [saved, setSaved] = useState<PreferenceState>(initial);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const dirty = useMemo(() => !sameState(values, saved), [values, saved]);

  function update(category: PreferenceCategory, channel: keyof Channels, next: boolean) {
    setStatus("idle");
    setMessage(null);
    setValues((current) => ({
      ...current,
      [category]: { ...current[category], [channel]: next },
    }));
  }

  function enableAll() {
    setStatus("idle");
    setMessage(null);
    const next = {} as PreferenceState;
    for (const category of NOTIFICATION_PREFERENCE_CATEGORIES) {
      next[category] = { inApp: true, email: true };
    }
    setValues(next);
  }

  function resetLocally() {
    setStatus("idle");
    setMessage(null);
    const next = {} as PreferenceState;
    for (const category of NOTIFICATION_PREFERENCE_CATEGORIES) {
      next[category] = { ...DEFAULT_CHANNELS[category] };
    }
    setValues(next);
  }

  function handleSave() {
    setStatus("idle");
    setMessage(null);
    startTransition(async () => {
      const result = await saveNotificationPreferencesAction(toPayload(values));
      if ("success" in result && result.success) {
        setSaved(values); // la persistance a réellement réussi
        setStatus("success");
        setMessage("Vos préférences ont été enregistrées.");
        toast.success("Vos préférences de notification ont été enregistrées.");
      } else {
        // Les valeurs saisies sont conservées : l'utilisateur peut réessayer.
        const err = "error" in result ? result.error : "Enregistrement impossible.";
        setStatus("error");
        setMessage(err);
        toast.error(err);
      }
    });
  }

  function handleReset() {
    setStatus("idle");
    setMessage(null);
    startTransition(async () => {
      const result = await resetNotificationPreferencesAction();
      if ("success" in result && result.success) {
        const next = {} as PreferenceState;
        for (const category of NOTIFICATION_PREFERENCE_CATEGORIES) {
          next[category] = { ...DEFAULT_CHANNELS[category] };
        }
        setValues(next);
        setSaved(next);
        setStatus("success");
        setMessage("Les paramètres par défaut ont été rétablis.");
        toast.success("Paramètres de notifications rétablis par défaut.");
      } else {
        const err = "error" in result ? result.error : "Réinitialisation impossible.";
        setStatus("error");
        setMessage(err);
        toast.error(err);
      }
    });
  }

  return (
    <div className="space-y-5">
      {/* ── Actions globales ── */}
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">Actions rapides</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            Les emails d&apos;inscription et de sécurité (mot de passe, connexion) ne sont jamais
            concernés par ces réglages.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="button"
            onClick={enableAll}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-3.5 py-2 text-xs font-semibold text-foreground transition-all hover:border-primary/35 hover:text-primary disabled:opacity-60"
          >
            <Check size={14} strokeWidth={2} />
            Tout activer
          </button>
          <button
            type="button"
            onClick={resetLocally}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-3.5 py-2 text-xs font-semibold text-foreground transition-all hover:border-primary/35 hover:text-primary disabled:opacity-60"
          >
            <RotateCcw size={14} strokeWidth={2} />
            Paramètres par défaut
          </button>
        </div>
      </div>

      {/* ── Catégories ── */}
      <div className="grid gap-4 lg:grid-cols-2">
        {NOTIFICATION_PREFERENCE_CATEGORIES.map((category) => {
          const meta = CATEGORY_META[category];
          const Icon = CATEGORY_ICON[category] ?? Bell;
          const channels = values[category];
          const defaults = DEFAULT_CHANNELS[category];

          return (
            <section
              key={category}
              aria-labelledby={`pref-${category}`}
              className="rounded-2xl border border-border bg-card shadow-card"
            >
              <div className="flex items-start gap-3 border-b border-border/70 p-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
                  <Icon size={17} strokeWidth={1.75} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 id={`pref-${category}`} className="text-sm font-bold text-foreground">
                      {meta.label}
                    </h2>
                    <Badge variant="outline" className="text-[10px]">
                      Défaut : {defaults.inApp ? "ClassPulse activé" : "ClassPulse désactivé"}
                      {" · "}
                      {defaults.email ? "e-mail activé" : "e-mail désactivé"}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {meta.description}
                  </p>
                </div>
              </div>

              <div className="divide-y divide-border/60">
                {/* Canal interne */}
                <div className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                  <div className="min-w-0">
                    <label
                      htmlFor={`switch-${category}-inapp`}
                      className="block text-sm font-semibold text-foreground"
                    >
                      Dans ClassPulse
                    </label>
                    <p
                      id={`hint-${category}-inapp`}
                      className="mt-0.5 text-xs leading-relaxed text-muted-foreground"
                    >
                      {meta.inAppHint}
                    </p>
                  </div>
                  <div className="flex items-center justify-between gap-3 sm:justify-end">
                    <Switch
                      id={`switch-${category}-inapp`}
                      describedBy={`hint-${category}-inapp`}
                      checked={channels.inApp}
                      disabled={isPending}
                      onChange={(next) => update(category, "inApp", next)}
                      stateLabel={channels.inApp ? "Activé" : "Désactivé"}
                    />
                    <span className="sr-only">
                      {meta.label} — notifications dans ClassPulse :{" "}
                      {channels.inApp ? "activées" : "désactivées"}
                    </span>
                  </div>
                </div>

                {/* Canal e-mail */}
                <div className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                  <div className="min-w-0">
                    <label
                      htmlFor={`switch-${category}-email`}
                      className="block text-sm font-semibold text-foreground"
                    >
                      Par e-mail
                    </label>
                    <p
                      id={`hint-${category}-email`}
                      className="mt-0.5 text-xs leading-relaxed text-muted-foreground"
                    >
                      {meta.emailHint}
                    </p>
                  </div>
                  <div className="flex items-center justify-between gap-3 sm:justify-end">
                    <Switch
                      id={`switch-${category}-email`}
                      describedBy={`hint-${category}-email`}
                      checked={channels.email}
                      disabled={isPending}
                      onChange={(next) => update(category, "email", next)}
                      stateLabel={channels.email ? "Activé" : "Désactivé"}
                    />
                    <span className="sr-only">
                      {meta.label} — notifications par e-mail :{" "}
                      {channels.email ? "activées" : "désactivées"}
                    </span>
                  </div>
                </div>

                {meta.note && (
                  <p className="bg-muted/40 p-4 text-xs leading-relaxed text-muted-foreground">
                    {meta.note}
                  </p>
                )}
              </div>
            </section>
          );
        })}
      </div>

      {/* ── Enregistrement + retours ── */}
      <div className="sticky bottom-20 z-10 flex flex-col gap-3 rounded-2xl border border-border bg-card/95 p-4 shadow-float backdrop-blur-sm md:bottom-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0" aria-live="polite">
            {status === "success" && message && (
              <p className="flex items-center gap-1.5 text-sm font-medium text-success">
                <Check size={15} strokeWidth={2.25} />
                {message}
              </p>
            )}
            {status === "error" && message && (
              <p
                role="alert"
                className="flex items-start gap-1.5 text-sm font-medium text-danger"
              >
                <AlertCircle size={15} strokeWidth={2.25} className="mt-0.5 shrink-0" />
                {message}
              </p>
            )}
            {status === "idle" && (
              <p className="text-xs text-muted-foreground">
                {dirty
                  ? "Modifications non enregistrées."
                  : "Toutes les modifications sont enregistrées."}
              </p>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={handleReset}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-muted-foreground transition-all hover:border-danger/40 hover:text-danger disabled:opacity-60"
            >
              <RotateCcw size={15} strokeWidth={2} />
              Rétablir les défauts
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isPending || !dirty}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-subtle transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending ? (
                <>
                  <BellOff size={15} strokeWidth={2} className="animate-pulse" />
                  Enregistrement…
                </>
              ) : (
                <>
                  <Check size={15} strokeWidth={2.25} />
                  Enregistrer
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
