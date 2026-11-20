import { Skeleton } from "@/component/ui/skeleton";

/**
 * Loading skeleton for the market detail page that matches the actual layout
 * to prevent layout shifts during content loading.
 */
export function MarketDetailSkeleton() {
  return (
    <div
      className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 p-6 md:p-10"
      role="status"
      aria-label="Loading market details"
    >
      <div className="mx-auto max-w-4xl">
        {/* Back button skeleton */}
        <Skeleton className="mb-6 h-5 w-32 bg-white/10 motion-reduce:animate-none" />

        {/* Main market card skeleton */}
        <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-8">
          {/* Header section */}
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex-1 min-w-0 space-y-3">
              {/* Title */}
              <Skeleton className="h-8 w-full max-w-xl bg-white/15 motion-reduce:animate-none" />
              
              {/* Badges row */}
              <div className="flex flex-wrap items-center gap-3">
                <Skeleton className="h-5 w-20 rounded-full bg-white/10 motion-reduce:animate-none" />
                <Skeleton className="h-5 w-16 rounded-full bg-white/10 motion-reduce:animate-none" />
                <Skeleton className="h-4 w-32 bg-white/10 motion-reduce:animate-none" />
              </div>
            </div>
            
            {/* Predict button skeleton */}
            <Skeleton className="h-10 w-28 rounded-full bg-orange-500/30 motion-reduce:animate-none" />
          </div>

          {/* Description skeleton */}
          <div className="mt-6 space-y-2">
            <Skeleton className="h-4 w-full bg-white/10 motion-reduce:animate-none" />
            <Skeleton className="h-4 w-5/6 bg-white/10 motion-reduce:animate-none" />
          </div>

          {/* Stats grid skeleton */}
          <div className="mt-8 grid grid-cols-1 gap-8 md:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="rounded-xl border border-white/10 bg-white/5 p-5 text-center space-y-2"
              >
                <Skeleton className="mx-auto h-3 w-28 bg-white/10 motion-reduce:animate-none" />
                <Skeleton className="mx-auto h-9 w-20 bg-white/15 motion-reduce:animate-none" />
              </div>
            ))}
          </div>

          {/* Dispute panel skeleton (for resolved markets) */}
          <div className="mt-4 space-y-4 rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-2">
                <Skeleton className="h-4 w-24 bg-white/15 motion-reduce:animate-none" />
                <Skeleton className="h-3 w-56 bg-white/10 motion-reduce:animate-none" />
              </div>
              <Skeleton className="h-8 w-28 rounded-md bg-orange-500/20 motion-reduce:animate-none" />
            </div>
            <Skeleton className="h-3 w-48 bg-white/10 motion-reduce:animate-none" />
          </div>
        </div>

        {/* Price history chart skeleton */}
        <div className="mt-8 space-y-4">
          {/* Chart header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-5 rounded bg-white/10 motion-reduce:animate-none" />
              <Skeleton className="h-6 w-32 bg-white/15 motion-reduce:animate-none" />
            </div>
            
            {/* Range selector skeleton */}
            <div className="flex gap-1 rounded-lg border border-white/10 bg-white/5 p-1">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton
                  key={i}
                  className="h-7 w-12 rounded-md bg-white/10 motion-reduce:animate-none"
                />
              ))}
            </div>
          </div>

          {/* Chart area skeleton */}
          <div className="rounded-xl border border-white/10 bg-slate-900/50 p-6 space-y-4">
            {/* Legend skeleton */}
            <div className="flex gap-3">
              <Skeleton className="h-9 w-32 rounded-lg bg-white/10 motion-reduce:animate-none" />
            </div>
            
            {/* Chart canvas skeleton */}
            <Skeleton className="h-80 w-full rounded-lg bg-slate-950/50 motion-reduce:animate-none" />
            
            {/* X-axis labels skeleton */}
            <div className="flex justify-between">
              <Skeleton className="h-3 w-20 bg-white/10 motion-reduce:animate-none" />
              <Skeleton className="h-3 w-20 bg-white/10 motion-reduce:animate-none" />
              <Skeleton className="h-3 w-20 bg-white/10 motion-reduce:animate-none" />
            </div>
          </div>
        </div>
      </div>
      
      <span className="sr-only">Loading market details...</span>
    </div>
  );
}
