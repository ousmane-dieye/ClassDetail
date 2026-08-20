import { Skeleton } from "@/components/ui/Skeleton";

export default function StudentDashboardLoading() {
  return (
    <div className="space-y-8 animate-pulse">
      {/* Hero */}
      <section className="grid gap-6 lg:grid-cols-12">
        <div className="flex flex-col justify-between gap-6 lg:col-span-8">
          <div className="space-y-4">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-10 w-72" />
            <Skeleton className="h-4 w-56" />
          </div>
          <div className="flex gap-2.5">
            <Skeleton className="h-8 w-36 rounded-full" />
            <Skeleton className="h-8 w-40 rounded-full" />
            <Skeleton className="h-8 w-32 rounded-full" />
          </div>
        </div>
        <CardSkeleton lg />
      </section>

      {/* Grid */}
      <div className="grid gap-8 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-7">
          <Skeleton className="h-6 w-48" />
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        </div>
        <div className="space-y-6 lg:col-span-5">
          <Skeleton className="h-6 w-40" />
          <div className="space-y-2.5">
            {Array.from({ length: 3 }).map((_, i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function CardSkeleton({ lg }: { lg?: boolean }) {
  return (
    <div className={`rounded-2xl border border-border bg-card p-6 ${lg ? "lg:col-span-4" : ""}`}>
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-8 rounded-lg" />
      </div>
      <div className="mt-4 flex items-center gap-5">
        <Skeleton className="h-20 w-20 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-3 w-32" />
        </div>
      </div>
    </div>
  );
}
