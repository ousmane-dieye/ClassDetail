import { Skeleton } from "@/components/ui/Skeleton";

export default function ChatLoading() {
  return (
    <div className="space-y-5 animate-pulse">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Skeleton className="mt-0.5 h-10 w-10 rounded-xl" />
        <div className="space-y-2">
          <Skeleton className="h-7 w-36" />
          <Skeleton className="h-4 w-56" />
        </div>
      </div>

      {/* Chat area */}
      <div className="flex h-[72vh] flex-col overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex-1 space-y-4 p-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className={`flex ${i % 3 === 0 ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[70%] space-y-2 rounded-2xl p-4 ${i % 3 === 0 ? "bg-primary/10" : "bg-muted"}`}>
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            </div>
          ))}
        </div>
        <div className="border-t border-border p-4">
          <div className="flex items-center gap-2">
            <Skeleton className="h-10 flex-1 rounded-xl" />
            <Skeleton className="h-10 w-10 rounded-xl" />
          </div>
        </div>
      </div>
    </div>
  );
}
