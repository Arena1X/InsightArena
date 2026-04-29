import Header from "@/component/Header";
import Footer from "@/component/Footer";
import PageBackground from "@/component/PageBackground";

export default function MarketsPage() {
  return (
    <PageBackground>
      <Header />

      <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
        <div className="max-w-lg space-y-6">
          {/* Pulsing badge */}
          <div className="inline-flex items-center gap-2 rounded-full border border-orange-500/30 bg-orange-500/10 px-4 py-2">
            <span className="h-2 w-2 animate-pulse rounded-full bg-orange-400" />
            <span className="text-sm font-semibold uppercase tracking-widest text-orange-400">
              Coming Soon
            </span>
          </div>

          <h1 className="text-4xl font-bold text-white sm:text-5xl">Markets</h1>

          <p className="text-base leading-relaxed text-gray-400 sm:text-lg">
            Browse and predict on live prediction markets — powered by Stellar
            and Soroban smart contracts. Public markets are launching soon.
          </p>

          <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <a
              href="/events"
              className="rounded-xl bg-orange-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-orange-600"
            >
              Browse Events
            </a>
            <a
              href="/leaderboard"
              className="rounded-xl border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              View Leaderboard
            </a>
          </div>
        </div>
      </main>

      <Footer />
    </PageBackground>
  );
}
