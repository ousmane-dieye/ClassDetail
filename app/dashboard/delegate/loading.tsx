import { Skeleton } from "@/components/ui/Skeleton";

export default function DelegateDashboardLoading() {
  return (
    <div className="space-y-8 animate-pulse">
      {/* Header */}
      <div className="space-y-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-72" />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-border bg-card p-4">
            <Skeleton className="h-10 w-10 rounded-xl" />
            <div className="mt-3 space-y-1">
              <Skeleton className="h-8 w-12" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
        ))}
      </div>

      {/* Pending requests */}
      <div className="space-y-4">
        <Skeleton className="h-6 w-56" />
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-xl" />
                  <div className="space-y-1.5">
                    <Skeleton className="h-4 w-36" />
                    <Skeleton className="h-3 w-48" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Skeleton className="h-8 w-20 rounded-xl" />
                  <Skeleton className="h-8 w-16 rounded-xl" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
