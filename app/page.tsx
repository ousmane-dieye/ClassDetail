import Link from "next/link";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
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
  Star,
  ShieldCheck,
  Clock,
  Quote,
  ChevronRight,
} from "lucide-react";

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground overflow-x-hidden">
      {/* ── Navigation ── */}
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3.5 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-subtle transition-transform duration-200 group-hover:scale-105">
              <GraduationCap size={20} strokeWidth={2} />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-display text-lg font-bold tracking-tight text-foreground">
                ClassPulse
              </span>
            </div>
          </Link>

          <nav className="hidden items-center gap-7 text-sm font-medium text-muted-foreground md:flex">
            <a href="#bibliotheque" className="transition-colors hover:text-foreground">Bibliothèque</a>
            <a href="#communautes" className="transition-colors hover:text-foreground">Communauté</a>
            <a href="#assistant" className="transition-colors hover:text-foreground">Assistant</a>
            <a href="#temoignages" className="transition-colors hover:text-foreground">Témoignages</a>
          </nav>

          <div className="flex items-center gap-2 sm:gap-3">
            <ThemeToggle />
            <Link
              href="/login"
              className="hidden rounded-xl border border-border px-4 py-2 text-sm font-semibold transition-all hover:border-primary/40 hover:bg-muted sm:inline-flex"
            >
              Se connecter
            </Link>
            <Link
              href="/register"
              className="group inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-subtle transition-all hover:bg-primary/90 hover:shadow-lift"
            >
              Rejoindre
              <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </div>
      </header>

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
              Cours, devoirs, documents, Hints, chat de classe et assistant IA —
              tout ce dont votre classe a besoin, réuni dans un espace calme
              et pensé pour durer.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/register"
                className="group inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-subtle transition-all hover:bg-primary/90 hover:shadow-lift"
              >
                Rejoindre ma classe
                <ArrowRight size={17} className="transition-transform group-hover:translate-x-1" />
              </Link>
              <Link
                href="/login"
                className="inline-flex h-12 items-center justify-center rounded-xl border border-border bg-card px-6 text-sm font-semibold transition-all hover:bg-muted"
              >
                J&apos;ai déjà un compte
              </Link>
            </div>

            <div className="mt-9 flex flex-wrap items-center gap-x-7 gap-y-4">
              <div className="flex items-center gap-2.5">
                <div className="flex -space-x-2.5">
                  {["A", "B", "D", "F"].map((l, i) => (
                    <div
                      key={i}
                      className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-background bg-secondary text-[11px] font-bold text-secondary-foreground"
                    >
                      {l}
                    </div>
                  ))}
                </div>
                <p className="text-xs leading-tight text-muted-foreground">
                  <span className="font-semibold text-foreground">+500 étudiants</span>
                  <br />
                  rejoignent chaque semestre
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Star key={i} size={14} className="fill-warning text-warning" />
                ))}
                <span className="ml-1 text-xs font-semibold text-foreground">4.9 / 5</span>
              </div>
            </div>
          </div>

          {/* Hero visuel */}
          <div className="relative animate-rise" style={{ animationDelay: "120ms" }}>
            <div className="relative mx-auto max-w-lg">
              <div className="overflow-hidden rounded-3xl border border-border shadow-float">
                <img
                  src={CS_IMAGES.heroLanding}
                  alt="Un enseignant accompagne des étudiants devant un ordinateur"
                  className="aspect-[4/3] w-full object-cover"
                  loading="eager"
                  decoding="async"
                />
                <div className="absolute inset-0 rounded-3xl ring-1 ring-inset ring-black/5" />
              </div>

              {/* Carte flottante — devoir */}
              <div className="absolute -left-3 -bottom-5 hidden w-56 rounded-2xl border border-border bg-card p-3.5 shadow-lift sm:block">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-danger/10 text-danger">
                    <Clock size={16} />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold text-foreground">TP 03 — Réseaux</p>
                    <p className="text-[11px] text-muted-foreground">Remise dans 2 jours</p>
                  </div>
                </div>
              </div>

              {/* Carte flottante — activité */}
              <div className="absolute -right-3 -top-5 hidden w-52 rounded-2xl border border-border bg-card p-3.5 shadow-lift sm:block">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-success/10 text-success">
                    <CheckSquare size={16} />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold text-foreground">Tâche terminée</p>
                    <p className="text-[11px] text-muted-foreground">Il y a quelques minutes</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Bandeau de confiance ── */}
      <div className="border-y border-border/60 bg-card/40">
        <div className="mx-auto max-w-5xl px-4 py-4 sm:px-6">
          <p className="text-center text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
            Utilisé par des classes d&apos;informatique en Afrique francophone
          </p>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-x-9 gap-y-2 text-muted-foreground/70">
            {["Université de Dakar", "ISTIC Dakar", "DUT Informatique", "Licence Pro CS", "GL & Réseaux"].map((name) => (
              <span key={name} className="text-xs font-semibold">{name}</span>
            ))}
          </div>
        </div>
      </div>

      {/* ── Section : Bibliothèque ── */}
      <section id="bibliotheque" className="py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div className="order-2 lg:order-1">
              <img
                src={CS_IMAGES.coding}
                alt="Code de programmation affiché sur un écran"
                className="aspect-[4/3] w-full rounded-3xl border border-border object-cover shadow-lift"
                loading="lazy"
                decoding="async"
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
                est classée par matière, consultable en deux clics et disponible
                pour toute la promotion.
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
                Explorer la bibliothèque
                <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Section : Communauté ── */}
      <section id="communautes" className="border-y border-border/60 bg-card/40 py-16 sm:py-24">
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
                Devoirs suivis, chat de promo et notifications temps réel :
                personne ne rate plus une échéance, ni un mot important.
              </p>
              <div className="mt-7 grid gap-3 sm:grid-cols-2">
                {[
                  { icon: CheckSquare, title: "Devoirs & tâches", desc: "Échéances visibles, urgent clair." },
                  { icon: MessageSquare, title: "Chat de classe", desc: "Échangez avec toute la promotion en direct." },
                  { icon: Bell, title: "Notifications", desc: "Toujours au courant, sans bruit." },
                  { icon: TrendingUp, title: "Statistiques", desc: "Votre progression en un coup d'œil." },
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
                src={CS_IMAGES.teamwork}
                alt="Des étudiants réunis autour d'un ordinateur portable"
                className="aspect-[4/3] w-full rounded-3xl border border-border object-cover shadow-lift"
                loading="lazy"
                decoding="async"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── Section : Assistant ── */}
      <section id="assistant" className="py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div className="order-2 lg:order-1">
              <img
                src={CS_IMAGES.contexts.ai}
                alt="Développeur travaillant la nuit sur un ordinateur"
                className="aspect-[4/3] w-full rounded-3xl border border-border object-cover shadow-lift"
                loading="lazy"
                decoding="async"
              />
            </div>
            <div className="order-1 lg:order-2">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Assistant IA</p>
              <h2 className="mt-3 font-display text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
                Un assistant qui comprend
                <br />
                votre cours.
              </h2>
              <p className="mt-4 max-w-md text-base leading-relaxed text-muted-foreground">
                Expliquer un extrait de code, résumer un chapitre, préparer un
                oral, générer un plan de révision : l&apos;assistant travaille
                dans le contexte de votre classe.
              </p>
              <ul className="mt-7 space-y-3.5">
                {[
                  { icon: Code2, text: "Explications de code, ligne par ligne" },
                  { icon: BookOpen, text: "Résumés et fiches de révision" },
                  { icon: Sparkles, text: "Suggestions adaptées à votre matière" },
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

      {/* ── Statistiques ── */}
      <section className="border-y border-border/60 bg-card/40 py-14">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
            {[
              { value: "500+", label: "Étudiants actifs", icon: Users },
              { value: "1 200+", label: "Documents partagés", icon: FileText },
              { value: "3 800+", label: "Tâches réalisées", icon: CheckSquare },
              { value: "98%", label: "Satisfaction", icon: Star },
            ].map(({ value, label, icon: Icon }) => (
              <div key={label} className="flex flex-col items-center text-center">
                <div className="mb-2.5 flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-card text-primary shadow-subtle">
                  <Icon size={17} strokeWidth={1.75} />
                </div>
                <p className="font-display text-3xl font-bold tracking-tight text-foreground">{value}</p>
                <p className="mt-1 text-xs font-medium text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Témoignages ── */}
      <section id="temoignages" className="py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mx-auto max-w-xl text-center">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Témoignages</p>
            <h2 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">
              Ce qu&apos;en disent les étudiants
            </h2>
          </div>
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {[
              { name: "Amadou D.", role: "GL2-A · Délégué", text: "Tout le monde est synchronisé : les deadlines, les documents, le chat. La classe s'organise enfin sans WhatsApp." },
              { name: "Fatou S.", role: "DUT Informatique", text: "L'assistant m'explique mes erreurs de code comme le ferait un tuteur. J'ai gagné un temps fou en révision." },
              { name: "Ibrahima K.", role: "Licence 3 CS", text: "Les annales et Hints sont une mine d'or. Mes meilleurs résultats depuis le début de ma licence." },
            ].map(({ name, role, text }) => (
              <figure key={name} className="flex flex-col rounded-2xl border border-border bg-card p-6 shadow-subtle transition-all hover:border-primary/25 hover:shadow-lift">
                <Quote size={18} className="mb-4 text-primary/50" />
                <blockquote className="flex-1 text-sm leading-relaxed text-foreground">
                  &ldquo;{text}&rdquo;
                </blockquote>
                <figcaption className="mt-5 flex items-center gap-3 border-t border-border/70 pt-4">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                    {name[0]}
                  </div>
                  <div>
                    <p className="text-xs font-bold text-foreground">{name}</p>
                    <p className="text-[11px] text-muted-foreground">{role}</p>
                  </div>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="pb-20">
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          <div className="brand-card relative overflow-hidden rounded-3xl p-8 text-center shadow-lift sm:p-14">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-subtle">
              <GraduationCap size={24} strokeWidth={1.75} />
            </div>
            <h2 className="mt-5 font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              {SITE.tagline}
            </h2>
            <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
              Créez votre compte en deux minutes. Votre délégué valide votre
              adhésion, et la classe est en marche.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/register"
                className="group inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-8 text-sm font-semibold text-primary-foreground shadow-subtle transition-all hover:bg-primary/90 hover:shadow-lift sm:w-auto"
              >
                Créer mon compte gratuitement
                <ChevronRight size={17} className="transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link
                href="/login"
                className="inline-flex h-12 w-full items-center justify-center rounded-xl border border-border bg-card px-8 text-sm font-semibold transition-all hover:bg-muted sm:w-auto"
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
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <GraduationCap size={17} />
              </div>
              <span className="font-display text-sm font-bold text-foreground">ClassPulse</span>
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <ShieldCheck size={12} />
                Accès validé par délégué
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
