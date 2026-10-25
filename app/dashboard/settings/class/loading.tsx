import { Skeleton } from "@/components/ui/Skeleton";

export default function MyClassSettingsLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* En-tête */}
      <div className="flex items-start gap-3">
        <Skeleton className="mt-0.5 h-10 w-10 rounded-xl" />
        <div className="space-y-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-72" />
        </div>
      </div>

      {/* État de l'appartenance */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="space-y-3">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-64" />
          <div className="flex flex-wrap gap-2 pt-2">
            <Skeleton className="h-9 w-36 rounded-xl" />
            <Skeleton className="h-9 w-40 rounded-xl" />
          </div>
        </div>
      </div>
    </div>
  );
}
