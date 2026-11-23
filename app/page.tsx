import Link from "next/link";
import { LandingHeader } from "@/components/marketing/LandingHeader";
import { CS_IMAGES, SITE } from "@/lib/constants/images";
import {
  BookOpen,
  FileText,
  CheckSquare,
  Sparkles,
  MessageSquare,
  Video,
  ArrowRight,
  GraduationCap,
  Bell,
  Users,
  TrendingUp,
  Code2,
  ShieldCheck,
  Clock,
  CalendarDays,
  UserPlus,
  ChevronRight,
} from "lucide-react";

/** Remplace la largeur demandée dans une URL Unsplash existante. */
function withWidth(url: string, width: number) {
  return url.replace(/w=\d+/, `w=${width}`);
}

/** Photos 4/3 servies à la bonne résolution selon le viewport (pas d'image 1600 px sur mobile). */
function photoProps(src: string, widths: number[], sizes: string, eager = false) {
  return {
    src: withWidth(src, widths[widths.length - 1]!),
    srcSet: widths.map((width) => `${withWidth(src, width)} ${width}w`).join(", "),
    sizes,
    width: widths[widths.length - 1]!,
    height: Math.round((widths[widths.length - 1]! * 3) / 4),
    loading: eager ? ("eager" as const) : ("lazy" as const),
    decoding: "async" as const,
  };
}

const HERO_SIZES = "(max-width: 1023px) calc(100vw - 2rem), 640px";
const SECTION_SIZES = "(max-width: 1023px) calc(100vw - 2rem), 640px";

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* ── Navigation ── */}
      <LandingHeader />

      {/* ── Hero ── */}
      <section className="relative">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-14 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:py-20">
          <div className="animate-rise">
            <p className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-muted-foreground shadow-subtle">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              La plateforme des classes d&apos;informatique
            </p>

            <h1 className="mt-5 font-display text-4xl font-bold leading-[1.08] tracking-tight text-foreground sm:text-5xl lg:text-6xl">
              Apprendre.
              <br />
              Construire.
              <br />
              <span className="text-primary">Partager.</span>
            </h1>

            <p className="mt-5 max-w-lg text-base leading-relaxed text-muted-foreground sm:text-lg">
              Devoirs, documents, Hints, cours enregistrés, emploi du temps,
              évaluations, chat de classe et assistant IA — tout ce dont votre
              classe a besoin, réuni dans un espace calme et pensé pour durer.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <Link
                href="/register"
                className="group inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-subtle transition-all hover:bg-primary/90 hover:shadow-lift sm:w-auto"
              >
                Rejoindre ma classe
                <ArrowRight size={17} className="transition-transform group-hover:translate-x-1" />
              </Link>
              <Link
                href="/login"
                className="inline-flex min-h-12 items-center justify-center rounded-xl border border-border bg-card px-6 py-3 text-sm font-semibold transition-all hover:bg-muted sm:w-auto"
              >
                J&apos;ai déjà un compte
              </Link>
            </div>
          </div>

          {/* Hero visuel */}
          <div className="relative animate-rise" style={{ animationDelay: "120ms" }}>
            <figure className="mx-auto max-w-lg">
              <div className="relative overflow-hidden rounded-3xl border border-border shadow-float">
                <img
                  {...photoProps(CS_IMAGES.heroLanding, [640, 960, 1280, 1600], HERO_SIZES, true)}
                  alt="Illustration : des étudiants réunis autour d'un ordinateur"
                  className="aspect-[4/3] w-full object-cover"
                />
                <div className="pointer-events-none absolute inset-0 rounded-3xl ring-1 ring-inset ring-black/5" />
              </div>
              <figcaption className="mt-2.5 text-center text-xs text-muted-foreground">
                Illustration — l&apos;espace d&apos;une classe sur ClassPulse.
              </figcaption>
            </figure>
          </div>
        </div>
      </section>

      {/* ── Bandeau de positionnement ── */}
      <div className="border-y border-border/60 bg-card/40">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-x-6 gap-y-2 px-4 py-4 text-center text-[13px] font-semibold leading-relaxed text-muted-foreground sm:px-6 sm:text-xs">
          <span className="flex items-center gap-1.5">
            <ShieldCheck size={13} className="text-primary" />
            Adhésion validée par un délégué ou un administrateur
          </span>
          <span className="flex items-center gap-1.5">
            <Code2 size={13} className="text-primary" />
            Conçu pour les classes d&apos;informatique
          </span>
          <span className="flex items-center gap-1.5">
            <Users size={13} className="text-primary" />
            Chaque classe garde ses propres données
          </span>
        </div>
      </div>

      {/* ── Section : Bibliothèque ── */}
      <section id="bibliotheque" className="scroll-mt-24 py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div className="order-2 lg:order-1">
              <img
                {...photoProps(CS_IMAGES.coding, [480, 800, 1200], SECTION_SIZES)}
                alt="Code de programmation affiché sur un écran"
                className="aspect-[4/3] w-full rounded-3xl border border-border object-cover shadow-lift"
              />
            </div>
            <div className="order-1 lg:order-2">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Bibliothèque</p>
              <h2 className="mt-3 font-display text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
                Tout le savoir de la classe,
                <br />
                au même endroit.
              </h2>
              <p className="mt-4 max-w-md text-base leading-relaxed text-muted-foreground">
                Polycopiés, TPs, annales et cours enregistrés : chaque ressource
                est classée par matière, ajoutée par les membres de la classe
                et partagée avec elle.
              </p>
              <ul className="mt-7 space-y-3.5">
                {[
                  { icon: FileText, text: "Documents partagés depuis Google Drive" },
                  { icon: Video, text: "Cours enregistrés, à revoir à votre rythme" },
                  { icon: BookOpen, text: "Hints et sujets d'examens des années précédentes" },
                ].map(({ icon: Icon, text }) => (
                  <li key={text} className="flex items-center gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-primary shadow-subtle">
                      <Icon size={15} strokeWidth={1.75} />
                    </span>
                    <span className="text-sm font-medium text-foreground">{text}</span>
                  </li>
                ))}
              </ul>
              <Link
                href="/register"
                className="group mt-8 inline-flex items-center gap-1.5 text-sm font-semibold text-primary transition-colors hover:text-primary/80"
              >
                Rejoindre ma classe
                <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Section : Communauté ── */}
      <section id="communautes" className="scroll-mt-24 border-y border-border/60 bg-card/40 py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Communauté</p>
              <h2 className="mt-3 font-display text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
                Une classe qui travaille
                <br />
                vraiment ensemble.
              </h2>
              <p className="mt-4 max-w-md text-base leading-relaxed text-muted-foreground">
                Devoirs suivis, chat de classe et notifications en temps réel :
                chaque échéance et chaque annonce de la classe au même
                endroit.
              </p>
              <div className="mt-7 grid gap-3 sm:grid-cols-2">
                {[
                  { icon: CheckSquare, title: "Devoirs & tâches", desc: "Échéances visibles, codées par urgence." },
                  { icon: MessageSquare, title: "Chat de classe", desc: "Échangez avec votre classe en direct." },
                  { icon: Bell, title: "Notifications", desc: "Rappels d'échéances et actualités de la classe." },
                  { icon: TrendingUp, title: "Statistiques", desc: "Votre taux de complétion des devoirs en un coup d'œil." },
                ].map(({ icon: Icon, title, desc }) => (
                  <div key={title} className="rounded-2xl border border-border bg-card p-4 shadow-subtle transition-all hover:border-primary/25 hover:shadow-lift">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Icon size={17} strokeWidth={1.75} />
                    </div>
                    <p className="mt-3 text-sm font-bold text-foreground">{title}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{desc}</p>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <img
                {...photoProps(CS_IMAGES.teamwork, [480, 800, 1200], SECTION_SIZES)}
                alt="Des étudiants réunis autour d'un ordinateur portable"
                className="aspect-[4/3] w-full rounded-3xl border border-border object-cover shadow-lift"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── Section : Assistant ── */}
      <section id="assistant" className="scroll-mt-24 py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div className="order-2 lg:order-1">
              <img
                {...photoProps(CS_IMAGES.contexts.ai, [480, 800, 1200], SECTION_SIZES)}
                alt="Développeur travaillant la nuit sur un ordinateur"
                className="aspect-[4/3] w-full rounded-3xl border border-border object-cover shadow-lift"
              />
            </div>
            <div className="order-1 lg:order-2">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Assistant IA</p>
              <h2 className="mt-3 font-display text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
                Un assistant qui connaît
                <br />
                votre classe.
              </h2>
              <p className="mt-4 max-w-md text-base leading-relaxed text-muted-foreground">
                Devoirs à venir, emploi du temps, évaluations, ressources,
                notifications : l&apos;assistant répond à partir des données
                réelles de votre classe, avec exactement vos droits d&apos;accès.
              </p>
              <ul className="mt-7 space-y-3.5">
                {[
                  { icon: Clock, text: "Vos échéances et devoirs à venir, consultés en direct" },
                  { icon: CalendarDays, text: "Votre emploi du temps et vos évaluations à venir" },
                  { icon: Sparkles, text: "Des boutons de navigation vers vos pages" },
                ].map(({ icon: Icon, text }) => (
                  <li key={text} className="flex items-center gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-primary shadow-subtle">
                      <Icon size={15} strokeWidth={1.75} />
                    </span>
                    <span className="text-sm font-medium text-foreground">{text}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── Fonctionnement ── */}
      <section id="fonctionnement" className="scroll-mt-24 border-y border-border/60 bg-card/40 py-14">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <div className="mx-auto max-w-xl text-center">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Fonctionnement</p>
            <h2 className="mt-3 font-display text-2xl font-bold tracking-tight sm:text-3xl">
              Trois étapes pour rejoindre votre classe
            </h2>
          </div>
          <div className="mt-9 grid gap-5 sm:grid-cols-3">
            {[
              { icon: UserPlus, step: "1", title: "Créez votre compte", desc: "Inscription avec votre adresse e-mail et sélection de votre classe." },
              { icon: ShieldCheck, step: "2", title: "Validation", desc: "Un délégué ou un administrateur examine votre demande." },
              { icon: GraduationCap, step: "3", title: "Votre tableau de bord", desc: "Vous accédez aux ressources et à l'espace de votre classe." },
            ].map(({ icon: Icon, step, title, desc }) => (
              <div key={step} className="rounded-2xl border border-border bg-card p-5 shadow-subtle">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Icon size={17} strokeWidth={1.75} />
                  </span>
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Étape {step}
                  </span>
                </div>
                <p className="mt-3 text-sm font-bold text-foreground">{title}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-16 sm:py-20">
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          <div className="brand-card relative overflow-hidden rounded-3xl p-8 text-center shadow-lift sm:p-14">
            <div className="mx-auto flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl border border-border bg-white shadow-subtle">
              <img src="/logo-mark.png" alt="" width={48} height={48} className="h-full w-full object-contain" />
            </div>
            <h2 className="mt-5 font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              {SITE.tagline}
            </h2>
            <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
              Créez votre compte et choisissez votre classe. Un délégué valide
              votre adhésion, puis l&apos;espace de votre classe vous ouvre.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 md:flex-row">
              <Link
                href="/register"
                className="group inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-center text-sm font-semibold leading-snug text-primary-foreground shadow-subtle transition-all hover:bg-primary/90 hover:shadow-lift sm:w-auto sm:px-8"
              >
                Créer mon compte gratuitement
                <ChevronRight size={17} className="shrink-0 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link
                href="/login"
                className="inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-border bg-card px-5 py-3 text-sm font-semibold transition-all hover:bg-muted sm:w-auto sm:px-8"
              >
                J&apos;ai déjà un compte
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-border/60 bg-card/40">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-xl border border-border bg-white">
                <img src="/logo-mark.png" alt="" width={32} height={32} className="h-full w-full object-contain" />
              </div>
              <span className="font-display text-sm font-bold text-foreground">ClassPulse</span>
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <ShieldCheck size={12} />
                Adhésion validée
              </span>
              <span className="flex items-center gap-1.5">
                <Code2 size={12} />
                Conçu pour l&apos;informatique
              </span>
              <span>© {new Date().getFullYear()}</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
