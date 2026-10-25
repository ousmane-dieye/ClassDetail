import { Skeleton } from "@/components/ui/Skeleton";

export default function ProfileSettingsLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* En-tête */}
      <div className="flex items-start gap-3">
        <Skeleton className="mt-0.5 h-10 w-10 rounded-xl" />
        <div className="space-y-2">
          <Skeleton className="h-7 w-44" />
          <Skeleton className="h-4 w-72" />
        </div>
      </div>

      {/* Carte d'identité / Avatar */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <Skeleton className="h-20 w-20 rounded-2xl shrink-0" />
          <div className="space-y-2.5 flex-1">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-60" />
            <div className="flex gap-2 pt-1">
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-5 w-28 rounded-full" />
            </div>
          </div>
        </div>
      </div>

      {/* Informations personnelles */}
      <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
        <Skeleton className="h-5 w-48" />
        <div className="space-y-3">
          <Skeleton className="h-10 w-full rounded-xl" />
          <Skeleton className="h-10 w-full rounded-xl" />
        </div>
      </div>

      {/* Informations académiques */}
      <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
        <Skeleton className="h-5 w-48" />
        <div className="space-y-3">
          <Skeleton className="h-8 w-full rounded-xl" />
          <Skeleton className="h-8 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}
