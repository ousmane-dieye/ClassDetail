import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";

const sansFont = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
  preload: true,
});

const displayFont = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ClassPulse — Apprendre. Construire. Partager.",
  description:
    "ClassPulse centralise les tâches, documents, Hints, cours enregistrés, chat et notifications pour votre classe.",
  openGraph: {
    title: "ClassPulse",
    description: "La plateforme académique des classes d'informatique.",
    type: "website",
  },
  icons: { icon: "/favicon.ico" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="fr"
      className={`${sansFont.variable} ${displayFont.variable}`}
      suppressHydrationWarning
      style={{ "--font-mono": "'Cascadia Code', 'Fira Code', ui-monospace, monospace" } as React.CSSProperties}
    >
      <body className="min-h-screen font-sans bg-background text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
