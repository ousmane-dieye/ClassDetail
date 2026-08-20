import { Skeleton } from "@/components/ui/Skeleton";

export default function StatsLoading() {
  return (
    <div className="space-y-8 animate-pulse">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Skeleton className="mt-0.5 h-10 w-10 rounded-xl" />
        <div className="space-y-2">
          <Skeleton className="h-7 w-52" />
          <Skeleton className="h-4 w-80" />
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-border bg-card p-4 sm:p-5">
            <Skeleton className="h-10 w-10 rounded-xl" />
            <div className="mt-3 space-y-1">
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
