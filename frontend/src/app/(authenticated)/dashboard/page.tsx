import Link from "next/link";

import CompetitionsJoined from "@/component/CompetitionsJoined";
import QuickActions from "@/component/QuickActions";

export default function DashboardPage() {
  const stats = [
    { label: "Reputation Score", value: "1,240", accent: "text-orange-400" },
    { label: "Total Predictions", value: "68", accent: "text-orange-400" },
    { label: "Win Rate", value: "73%", accent: "text-yellow-400" },
    { label: "Total Winnings", value: "1,125 XLM", accent: "text-orange-400" },
  ] as const;

  const reputationTier = "Gold";

  const activePredictions = [
    {
      id: "mkt-1",
      title: "Will XLM close above $0.20 this week?",
      outcome: "Yes",
      stake: "50 XLM",
      timeRemaining: "2d 14h",
      probability: "62%",
    },
    {
      id: "mkt-2",
      title: "Bitcoin price above $100k by year end?",
      outcome: "No",
      stake: "25 XLM",
      timeRemaining: "5d 3h",
      probability: "41%",
    },
  ] as const;

  const upcomingResolutions = [
    {
      id: "mkt-3",
      title: "Ethereum ETF approval by end of month",
      ended: "Ended 6h ago",
    },
    {
      id: "mkt-4",
      title: "Will top 10 DeFi TVL increase this week?",
      ended: "Ended 1d ago",
    },
  ] as const;

  const recentActivity = [
    {
      id: "act-1",
      label: 'Prediction submitted on "XLM Weekly Close"',
      meta: "Today",
      badge: "Submitted",
    },
    {
      id: "act-2",
      label: 'Payout claimed for "BTC Breakout"',
      meta: "Yesterday",
      badge: "+120 XLM",
    },
    {
      id: "act-3",
      label: 'Competition joined: "Stellar Weekly Predictions"',
      meta: "2 days ago",
      badge: "Joined",
    },
    {
      id: "act-4",
      label: "Achievement unlocked: Consistency Streak",
      meta: "4 days ago",
      badge: "Unlocked",
    },
  ] as const;

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
        {stats.map((item) => (
          <div
            key={item.label}
            className="rounded-2xl border border-white/10 bg-white/5 p-6 transition-colors hover:border-orange-500/40"
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-white/90 text-sm font-medium">
                {item.label}
              </h3>
              {item.label === "Reputation Score" ? (
                <span className="rounded-xl border border-orange-500/30 bg-orange-500/10 px-2.5 py-1 text-xs font-semibold text-orange-400">
                  {reputationTier}
                </span>
              ) : null}
            </div>
            <p className={["mt-3 text-3xl font-bold", item.accent].join(" ")}>
              {item.value}
            </p>
          </div>
        ))}
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 xl:col-span-2">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-white font-semibold">Active Predictions</h3>
            <Link
              href="/my-predictions"
              className="text-sm font-medium text-orange-300 transition hover:text-orange-200"
            >
              View All
            </Link>
          </div>

          <div className="mt-5 space-y-4">
            {activePredictions.map((prediction) => (
              <div
                key={prediction.id}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"
              >
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div className="space-y-1">
                    <p className="text-white font-medium">{prediction.title}</p>
                    <p className="text-sm text-gray-400">
                      Outcome:{" "}
                      <span className="text-white">{prediction.outcome}</span> •
                      Stake:{" "}
                      <span className="text-white">{prediction.stake}</span>
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded-xl border border-white/10 bg-white/5 px-2.5 py-1 text-gray-200">
                      {prediction.timeRemaining} left
                    </span>
                    <span className="rounded-xl border border-orange-500/30 bg-orange-500/10 px-2.5 py-1 font-semibold text-orange-400">
                      {prediction.probability} prob.
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <h3 className="text-white font-semibold">Quick Actions</h3>
            <div className="mt-4 grid grid-cols-1 gap-3">
              <Link
                href="/markets"
                className="rounded-xl bg-orange-500 px-4 py-2 text-center text-sm font-semibold text-white transition hover:bg-orange-500/90"
              >
                Browse Markets
              </Link>
              <Link
                href="/leaderboards"
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-center text-sm font-semibold text-gray-200 transition hover:bg-white/10"
              >
                View Leaderboard
              </Link>
              <Link
                href="/competitions"
                className="rounded-xl border border-orange-500/30 bg-orange-500/10 px-4 py-2 text-center text-sm font-semibold text-orange-400 transition hover:bg-orange-500/20"
              >
                Join Competition
              </Link>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <h3 className="text-white font-semibold">Upcoming Resolutions</h3>
            <div className="mt-4 space-y-3">
              {upcomingResolutions.map((market) => (
                <div
                  key={market.id}
                  className="rounded-xl border border-white/10 bg-white/[0.03] p-3"
                >
                  <p className="text-sm font-medium text-white">
                    {market.title}
                  </p>
                  <p className="mt-1 text-xs text-gray-400">{market.ended}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Competitions Joined Section */}
      <CompetitionsJoined />
      <QuickActions />

      <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <h3 className="text-white font-semibold">Recent Activity</h3>
        <ol className="mt-5 space-y-3">
          {recentActivity.map((item) => (
            <li
              key={item.id}
              className="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="space-y-1">
                <p className="text-sm font-medium text-white">{item.label}</p>
                <p className="text-xs text-gray-400">{item.meta}</p>
              </div>
              <span className="inline-flex self-start rounded-xl border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-semibold text-gray-200 sm:self-center">
                {item.badge}
              </span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
