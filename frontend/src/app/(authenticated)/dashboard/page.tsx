"use client";

import { useMemo } from "react";
import Link from "next/link";

import CompetitionsJoined from "@/component/CompetitionsJoined";
import QuickActions from "@/component/QuickActions";
import { useWallet } from "@/context/WalletContext";

type RandomGenerator = () => number;

type DashboardStat = {
  label: string;
  value: string;
  accent: string;
};

type ActivePrediction = {
  id: string;
  title: string;
  outcome: "Yes" | "No";
  stake: string;
  timeRemaining: string;
  probability: string;
};

type UpcomingResolution = {
  id: string;
  title: string;
  ended: string;
};

type RecentActivity = {
  id: string;
  label: string;
  meta: string;
  badge: string;
};

const FALLBACK_DASHBOARD_SEED = "insightarena-dashboard-guest";

const ACTIVE_MARKET_TITLES = [
  "Will XLM close above $0.25 this week?",
  "Will Bitcoin trade above $100k by quarter end?",
  "Will Ethereum gas average below 20 gwei this weekend?",
  "Will Stellar daily payments exceed 2M tomorrow?",
  "Will SOL stay above $150 through Friday?",
  "Will the next CPI print come in below forecast?",
] as const;

const RESOLUTION_MARKET_TITLES = [
  "Ethereum ETF net inflows positive by market close",
  "Top 10 DeFi TVL increases this week",
  "XLM 24h volume finishes above $250M",
  "Will BTC dominance close below 52%?",
  "Stellar Soroban contract deployments hit a new weekly high",
  "Will the Fed leave rates unchanged next meeting?",
] as const;

const ACTIVITY_TEMPLATES = [
  { label: 'Prediction submitted on "XLM Weekly Close"', badge: "Submitted" },
  { label: 'Payout claimed for "BTC Breakout"', badge: "XLM" },
  {
    label: 'Competition joined: "Stellar Weekly Predictions"',
    badge: "Joined",
  },
  { label: "Achievement unlocked: Consistency Streak", badge: "Unlocked" },
  { label: 'Stake increased on "Macro Markets Sprint"', badge: "Staked" },
  { label: 'Prediction resolved for "ETH Gas Tracker"', badge: "Resolved" },
] as const;

function hashStringToSeed(value: string): number {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function createSeededRandom(seedValue: string): RandomGenerator {
  let seed = hashStringToSeed(seedValue) || 1;

  return () => {
    seed += 0x6d2b79f5;
    let value = seed;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function randomInt(random: RandomGenerator, min: number, max: number): number {
  return Math.floor(random() * (max - min + 1)) + min;
}

function pickUnique<T>(
  options: readonly T[],
  count: number,
  random: RandomGenerator,
): T[] {
  const pool = [...options];
  const picks: T[] = [];

  while (picks.length < count && pool.length > 0) {
    picks.push(pool.splice(randomInt(random, 0, pool.length - 1), 1)[0]);
  }

  return picks;
}

function buildDashboardData(seedValue: string): {
  stats: DashboardStat[];
  reputationTier: string;
  activePredictions: ActivePrediction[];
  upcomingResolutions: UpcomingResolution[];
  recentActivity: RecentActivity[];
} {
  const random = createSeededRandom(seedValue);
  const reputation = randomInt(random, 640, 2800);
  const totalPredictions = randomInt(random, 14, 180);
  const winRate = randomInt(random, 42, 88);
  const totalWinnings = randomInt(random, 150, 4800);
  const reputationTier =
    reputation >= 2200 ? "Platinum" : reputation >= 1400 ? "Gold" : "Silver";

  const stats = [
    {
      label: "Reputation Score",
      value: reputation.toLocaleString(),
      accent: "text-orange-400",
    },
    {
      label: "Total Predictions",
      value: totalPredictions.toLocaleString(),
      accent: "text-orange-400",
    },
    { label: "Win Rate", value: `${winRate}%`, accent: "text-yellow-400" },
    {
      label: "Total Winnings",
      value: `${totalWinnings.toLocaleString()} XLM`,
      accent: "text-orange-400",
    },
  ];

  const activePredictions: ActivePrediction[] = pickUnique(
    ACTIVE_MARKET_TITLES,
    2,
    random,
  ).map((title, index) => ({
    id: `active-${index}-${hashStringToSeed(`${seedValue}-${title}`)}`,
    title,
    outcome: random() > 0.5 ? "Yes" : "No",
    stake: `${randomInt(random, 10, 125)} XLM`,
    timeRemaining: `${randomInt(random, 1, 6)}d ${randomInt(random, 1, 23)}h`,
    probability: `${randomInt(random, 28, 82)}%`,
  }));

  const upcomingResolutions = pickUnique(
    RESOLUTION_MARKET_TITLES,
    2,
    random,
  ).map((title, index) => ({
    id: `resolution-${index}-${hashStringToSeed(`${seedValue}-${title}`)}`,
    title,
    ended:
      random() > 0.45
        ? `Ended ${randomInt(random, 2, 22)}h ago`
        : `Ended ${randomInt(random, 1, 3)}d ago`,
  }));

  const recentActivity = pickUnique(ACTIVITY_TEMPLATES, 4, random).map(
    (activity, index) => {
      const badge =
        activity.badge === "XLM"
          ? `+${randomInt(random, 35, 220)} XLM`
          : activity.badge;

      return {
        id: `activity-${index}-${hashStringToSeed(`${seedValue}-${activity.label}`)}`,
        label: activity.label,
        meta:
          index === 0 ? "Today" : `${index + randomInt(random, 0, 2)} days ago`,
        badge,
      };
    },
  );

  return {
    stats,
    reputationTier,
    activePredictions,
    upcomingResolutions,
    recentActivity,
  };
}

export default function DashboardPage() {
  const { address } = useWallet();
  const dashboardData = useMemo(
    () => buildDashboardData(address ?? FALLBACK_DASHBOARD_SEED),
    [address],
  );
  const {
    stats,
    reputationTier,
    activePredictions,
    upcomingResolutions,
    recentActivity,
  } = dashboardData;

  return (
    <div className="space-y-6 p-4 sm:p-6">
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
