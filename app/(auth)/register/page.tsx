import { createClient } from "@/lib/supabase/server";
import { RegisterForm } from "@/components/RegisterForm";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { CS_IMAGES, SITE } from "@/lib/constants/images";
import Link from "next/link";
import { ArrowLeft, GraduationCap, Users, ShieldCheck, Zap } from "lucide-react";

export default async function RegisterPage() {
  const supabase = createClient();
  const { data: classes } = await supabase
    .from("classes")
    .select("id, name, level, academic_year")
    .order("name");

  return (
    <main className="flex min-h-screen w-full flex-col bg-background lg:flex-row">
      {/* ── Panneau formulaire ── */}
      <div className="relative flex min-h-screen flex-1 flex-col bg-background lg:w-[54%] xl:w-7/12">
        <div className="flex items-center justify-between px-6 py-4 sm:px-10">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground lg:hidden"
          >
            <ArrowLeft size={13} />
            <span>Accueil</span>
          </Link>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </div>

        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-6">
          <RegisterForm classes={classes ?? []} />
        </div>

        <div className="px-6 pb-6 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} {SITE.name} — Tous droits réservés.
        </div>
      </div>

      {/* ── Panneau visuel (desktop) ── */}
      <div className="relative hidden lg:flex lg:w-[46%] xl:w-5/12 flex-col justify-between overflow-hidden p-12 text-white">
        <img
          src={CS_IMAGES.registerBanner}
          alt="Étudiants en informatique collaborant autour d'un ordinateur"
          className="absolute inset-0 h-full w-full object-cover"
          loading="eager"
          decoding="async"
        />
        <div className="absolute inset-0 bg-gradient-to-tl from-foreground/85 via-foreground/55 to-foreground/20" />

        {/* En-tête */}
        <div className="relative z-10 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/15 backdrop-blur-sm">
              <GraduationCap size={19} strokeWidth={2} />
            </div>
            <span className="font-display text-base font-bold tracking-tight">{SITE.name}</span>
          </div>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-white/90 ring-1 ring-white/15 backdrop-blur-sm transition-all hover:bg-white/20 hover:text-white"
          >
            <ArrowLeft size={15} />
            <span>Accueil</span>
          </Link>
        </div>

        {/* Points forts */}
        <div className="relative z-10 my-auto space-y-5">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/60">Pourquoi rejoindre ?</p>
          {[
            { icon: Users, text: "Une communauté d'étudiants qui s'entraide" },
            { icon: ShieldCheck, text: "Accès validé et sécurisé par votre délégué" },
            { icon: Zap, text: "Disponible 24h/24 — cours, docs, chat, IA" },
          ].map(({ icon: Icon, text }) => (
            <div key={text} className="flex items-center gap-3.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/15 backdrop-blur-sm">
                <Icon size={16} strokeWidth={1.75} />
              </div>
              <span className="text-sm font-medium leading-snug text-white/90">{text}</span>
            </div>
          ))}
        </div>

        {/* Citation */}
        <div className="relative z-10 space-y-3">
          <blockquote className="font-display text-2xl font-bold leading-snug tracking-tight text-white">
            &ldquo;{SITE.quotes.auth}&rdquo;
          </blockquote>
          <p className="text-sm font-medium text-white/70">{SITE.tagline}</p>
        </div>
      </div>
    </main>
  );
}
