import { Skeleton } from "@/components/ui/Skeleton";

export default function DashboardLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="space-y-4 animate-pulse">
        <Skeleton className="h-10 w-10 rounded-xl mx-auto" />
        <Skeleton className="h-4 w-48 mx-auto" />
      </div>
    </div>
  );
}
