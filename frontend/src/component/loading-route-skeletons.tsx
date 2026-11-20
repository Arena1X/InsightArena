import { Skeleton } from "@/component/ui/skeleton";

export function MarketCardSkeleton() {
  return (
    <div
      className="min-h-[220px] rounded-xl border border-border bg-card p-4"
      aria-hidden="true"
    >
      <div className="flex items-center justify-between gap-2">
        <Skeleton className="h-5 w-3/4 motion-reduce:animate-none" />
        <Skeleton className="size-[18px] rounded-full motion-reduce:animate-none" />
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <Skeleton className="h-5 w-20 rounded-full motion-reduce:animate-none" />
        <Skeleton className="h-5 w-16 rounded-full motion-reduce:animate-none" />
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div className="space-y-1">
          <Skeleton className="h-5 w-24 motion-reduce:animate-none" />
          <Skeleton className="h-7 w-12 motion-reduce:animate-none" />
        </div>
        <div className="space-y-1.5">
          <Skeleton className="ml-auto h-5 w-20 motion-reduce:animate-none" />
          <Skeleton className="ml-auto h-4 w-14 motion-reduce:animate-none" />
        </div>
      </div>

      <Skeleton className="mt-3 h-2 w-full rounded-full motion-reduce:animate-none" />

      <div className="mt-4 flex justify-end">
        <Skeleton className="h-9 w-[84px] motion-reduce:animate-none" />
      </div>
    </div>
  );
}

export function MarketsGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div
      className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3"
      role="status"
      aria-label="Loading markets"
    >
      {Array.from({ length: count }).map((_, idx) => (
        <MarketCardSkeleton key={idx} />
      ))}
      <span className="sr-only">Loading markets...</span>
    </div>
  );
}

export function MarketsPageLoadingSkeleton() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 p-6 md:p-10">
      <div className="mx-auto max-w-7xl space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-white">Markets</h1>
          <p className="mt-2 text-gray-400">
            Browse and predict on various markets
          </p>
        </div>
        <MarketsGridSkeleton />
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0f172a]/70 p-6 backdrop-blur-sm">
      <Skeleton className="mb-4 h-5 w-40 bg-white/15" />
      <Skeleton className="mb-2 h-8 w-24 bg-white/20" />
      <Skeleton className="h-4 w-32 bg-white/10" />
    </div>
  );
}

export function MarketingPageLoadingSkeleton() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 p-6 md:p-10">
      <div className="mx-auto max-w-7xl space-y-8">
        <Skeleton className="h-14 w-full rounded-2xl bg-white/10" />

        <section className="space-y-4 rounded-3xl border border-white/10 bg-[#111827]/60 p-8">
          <Skeleton className="h-12 w-3/4 bg-white/15" />
          <Skeleton className="h-5 w-full max-w-3xl bg-white/10" />
          <Skeleton className="h-5 w-2/3 bg-white/10" />
          <div className="flex gap-4 pt-2">
            <Skeleton className="h-10 w-36 rounded-xl bg-[#4FD1C5]/30" />
            <Skeleton className="h-10 w-32 rounded-xl bg-white/20" />
          </div>
        </section>

        <section className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, idx) => (
            <SkeletonCard key={idx} />
          ))}
        </section>

        <Skeleton className="h-24 w-full rounded-2xl bg-white/10" />
      </div>
    </div>
  );
}

export function StandardPageLoadingSkeleton() {
  return (
    <div className="min-h-screen p-6 md:p-10">
      <div className="mx-auto max-w-7xl space-y-8">
        <div className="space-y-3">
          <Skeleton className="h-10 w-72 bg-white/15" />
          <Skeleton className="h-5 w-[28rem] max-w-full bg-white/10" />
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, idx) => (
            <SkeletonCard key={idx} />
          ))}
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#0f172a]/70 p-6">
          <Skeleton className="mb-6 h-5 w-48 bg-white/15" />
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, idx) => (
              <Skeleton key={idx} className="h-12 w-full bg-white/10" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function AuthenticatedPageLoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, idx) => (
          <SkeletonCard key={idx} />
        ))}
      </div>

      <div className="rounded-2xl border border-white/10 bg-[#0f172a]/70 p-6">
        <Skeleton className="mb-6 h-6 w-56 bg-white/15" />
        <div className="space-y-4">
          {Array.from({ length: 6 }).map((_, idx) => (
            <Skeleton key={idx} className="h-11 w-full bg-white/10" />
          ))}
        </div>
      </div>
    </div>
  );
}

export function LeaderboardTailSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div
      className="space-y-2 pt-2"
      role="status"
      aria-label="Loading more rankings"
    >
      {Array.from({ length: rows }).map((_, idx) => (
        <div
          key={idx}
          className="flex items-center gap-4 rounded-xl border border-white/5 bg-white/5 px-4 py-3"
        >
          <Skeleton className="h-7 w-7 rounded-full bg-white/15 motion-reduce:animate-none" />
          <Skeleton className="h-4 w-32 bg-white/15 motion-reduce:animate-none" />
          <Skeleton className="ml-auto h-4 w-16 bg-white/10 motion-reduce:animate-none" />
        </div>
      ))}
      <span className="sr-only">Loading more rankings...</span>
    </div>
  );
}
