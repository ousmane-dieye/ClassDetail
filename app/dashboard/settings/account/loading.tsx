import { Skeleton } from "@/components/ui/Skeleton";

export default function AccountSettingsLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* En-tête */}
      <div className="flex items-start gap-3">
        <Skeleton className="mt-0.5 h-10 w-10 rounded-xl" />
        <div className="space-y-2">
          <Skeleton className="h-7 w-52" />
          <Skeleton className="h-4 w-80" />
        </div>
      </div>

      {/* Informations de session */}
      <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
        <Skeleton className="h-5 w-44" />
        <div className="space-y-3">
          <Skeleton className="h-10 w-full rounded-xl" />
          <Skeleton className="h-10 w-full rounded-xl" />
        </div>
      </div>

      {/* Formulaire de mot de passe */}
      <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
        <Skeleton className="h-5 w-48" />
        <div className="space-y-3">
          <Skeleton className="h-10 w-full rounded-xl" />
          <Skeleton className="h-10 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
          <div className="flex justify-end">
            <Skeleton className="h-10 w-48 rounded-xl" />
          </div>
        </div>
      </div>
    </div>
  );
}
