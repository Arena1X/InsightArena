import { Skeleton } from "@/component/ui/skeleton";

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
