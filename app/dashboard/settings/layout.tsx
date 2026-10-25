import { SettingsTabs } from "@/components/settings/SettingsTabs";

export const metadata = {
  title: "Paramètres — ClassPulse",
};

/**
 * Module Paramètres : navigation interne commune à toutes les sections
 * (notifications, ma classe). La sidebar et le menu mobile « Plus » pointent
 * vers /dashboard/settings/notifications ; le routeur racine de redirige
 * vers la même section.
 */
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <SettingsTabs />
      {children}
    </div>
  );
}
