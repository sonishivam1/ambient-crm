import { Skeleton } from "@/components/ui/primitives";

export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className="g-hero mb-[22px]">
        <div className="px-2 pt-1.5">
          <Skeleton className="mb-3 h-3 w-40" />
          <Skeleton className="mb-3 h-8 w-72" />
          <Skeleton className="h-4 w-64" />
        </div>
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="min-h-[132px] rounded-[20px]" />
        ))}
      </div>
      <div className="mb-[18px] grid grid-cols-1 gap-[18px] sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[132px] rounded-[22px]" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-[18px] xl:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-[300px] rounded-[22px]" />
        ))}
      </div>
    </div>
  );
}
