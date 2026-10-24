import Link from "next/link";
import { AlertCircle, Bell, RefreshCw } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/PageHeader";
import { NotificationPreferencesForm } from "@/components/settings/NotificationPreferencesForm";
import {
  DEFAULT_CHANNELS,
  NOTIFICATION_PREFERENCE_CATEGORIES,
  isPreferenceCategory,
  resolveChannels,
  type Channels,
  type PreferenceCategory,
} from "@/lib/constants/notificationPreferences";

export const metadata = {
  title: "Paramètres de notifications — ClassPulse",
};

type PreferenceState = Record<PreferenceCategory, Channels>;

function withDefaults(): PreferenceState {
  const state = {} as PreferenceState;
  for (const category of NOTIFICATION_PREFERENCE_CATEGORIES) {
    state[category] = { ...DEFAULT_CHANNELS[category] };
  }
  return state;
}

export default async function NotificationSettingsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Lecture RLS (propres préférences uniquement). Une erreur EST une erreur :
  // elle ne est jamais présentée comme « aucune préférence enregistrée ».
  const { data, error } = await supabase
    .from("notification_preferences")
    .select("category, in_app_enabled, email_enabled");

  const initial = withDefaults();
  if (!error) {
    for (const row of data ?? []) {
      if (isPreferenceCategory(row.category)) {
        initial[row.category] = resolveChannels(row.category, row);
      }
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Bell}
        title="Paramètres de notifications"
        description="Choisissez comment vous souhaitez être informé des événements de votre classe."
      />

      {error ? (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-2xl border border-danger/40 bg-danger/8 p-5 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-start gap-3">
            <AlertCircle size={18} className="mt-0.5 shrink-0 text-danger" />
            <div>
              <p className="text-sm font-semibold text-danger">
                Impossible de charger vos préférences
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                Aucune modification n&apos;a été appliquée. Réessayez dans quelques instants.
              </p>
            </div>
          </div>
          <Link
            href="/dashboard/settings/notifications"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-border bg-background px-3.5 py-2 text-xs font-semibold text-foreground transition-all hover:border-primary/35 hover:text-primary"
          >
            <RefreshCw size={14} strokeWidth={2} />
            Réessayer
          </Link>
        </div>
      ) : (
        <NotificationPreferencesForm initial={initial} />
      )}
    </div>
  );
}
