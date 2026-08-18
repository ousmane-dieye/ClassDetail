import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { CS_IMAGES, SITE } from "@/lib/constants/images";
import Link from "next/link";
import { ArrowLeft, GraduationCap, AlertTriangle } from "lucide-react";

export default function RecoveryErrorPage() {
  return (
    <main className="flex min-h-screen w-full flex-col bg-background lg:flex-row">
      {/* ── Panneau visuel (desktop) ── */}
      <div className="relative hidden lg:flex lg:w-[46%] xl:w-5/12 flex-col justify-between overflow-hidden p-12 text-white">
        <img
          src={CS_IMAGES.loginBanner}
          alt="Étudiant en informatique travaillant sur du code"
          className="absolute inset-0 h-full w-full object-cover"
          loading="eager"
          decoding="async"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-foreground/85 via-foreground/55 to-foreground/25" />

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

        <p className="relative z-10 text-sm font-medium text-white/70">{SITE.tagline}</p>
      </div>

      {/* ── Panneau message ── */}
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

        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-8">
          <div className="w-full space-y-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-warning/15 text-warning">
              <AlertTriangle size={24} />
            </div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Lien invalide ou expiré
            </h1>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Le lien de récupération que vous avez utilisé n&apos;est plus valide. Il a pu expirer
              ou avoir déjà été utilisé. Relancez simplement la procédure pour recevoir un
              nouveau lien.
            </p>
            <Link
              href="/forgot-password"
              className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-primary text-sm font-semibold text-primary-foreground shadow-subtle transition-all hover:bg-primary/90"
            >
              Recevoir un nouveau lien
            </Link>
          </div>
        </div>

        <div className="px-6 pb-6 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} {SITE.name} — Tous droits réservés.
        </div>
      </div>
    </main>
  );
}
