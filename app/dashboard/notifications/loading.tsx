import { Skeleton } from "@/components/ui/Skeleton";

export default function NotificationsLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <Skeleton className="mt-0.5 h-10 w-10 rounded-xl" />
          <div className="space-y-2">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-4 w-72" />
          </div>
        </div>
        <Skeleton className="h-9 w-44 rounded-xl" />
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-20 rounded-xl" />
        ))}
      </div>

      {/* List */}
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-start gap-3.5">
              <Skeleton className="h-10 w-10 shrink-0 rounded-xl" />
              <div className="flex-1 space-y-2">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-12" />
                </div>
                <Skeleton className="h-3 w-64" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
