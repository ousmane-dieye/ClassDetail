import { Skeleton } from "@/components/ui/Skeleton";

export default function AdminEmailsLoading() {
  return (
    <div className="space-y-8 animate-pulse">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Skeleton className="mt-0.5 h-10 w-10 rounded-xl" />
        <div className="space-y-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-72" />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-border bg-card p-4">
            <Skeleton className="h-8 w-12" />
            <Skeleton className="mt-1 h-3 w-20" />
          </div>
        ))}
      </div>

      {/* Content */}
      <div className="space-y-4">
        <Skeleton className="h-48 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    </div>
  );
}
