import { Skeleton } from "@/components/ui/Skeleton";

export default function HintsLoading() {
  return (
    <div className="space-y-8 animate-pulse">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Skeleton className="mt-0.5 h-10 w-10 rounded-xl" />
        <div className="space-y-2">
          <Skeleton className="h-7 w-44" />
          <Skeleton className="h-4 w-72" />
        </div>
      </div>

      {/* Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-start justify-between">
              <Skeleton className="h-12 w-12 rounded-2xl" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <div className="mt-3 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
            <div className="mt-6 flex items-center justify-between border-t border-border/60 pt-3">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-8 w-20 rounded-xl" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
