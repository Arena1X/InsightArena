"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, Award, Clock3, TrendingUp } from "lucide-react";

import Footer from "@/component/Footer";
import Header from "@/component/Header";
import LeaderboardFilters, {
  type LeaderboardFiltersState,
} from "@/component/leaderboard/LeaderboardFilters";
import LeaderboardOverview from "@/component/leaderboard/LeaderboardOverview";
import LeaderboardTable, {
  type LeaderboardEntry,
} from "@/component/leaderboard/LeaderboardTable";
import type { StatCardProps } from "@/component/rewards/StatCard";
import PageBackground from "@/component/PageBackground";

type RankedEntry = LeaderboardEntry & {
  streak: number;
  category: "crypto" | "sports" | "politics" | "custom";
  badges: string[];
};

const INITIAL_ENTRIES: RankedEntry[] = [
  {
    rank: 1,
    username: "0xArena_Pro",
    points: 9840,
    winRate: 91,
    predictions: 312,
    streak: 16,
    category: "crypto",
    badges: ["Top Oracle", "Market Maker"],
  },
  {
    rank: 2,
    username: "CryptoSage",
    points: 8720,
    winRate: 87,
    predictions: 278,
    streak: 11,
    category: "crypto",
    badges: ["Momentum Hunter"],
  },
  {
    rank: 3,
    username: "PredictKing",
    points: 7950,
    winRate: 83,
    predictions: 245,
    streak: 8,
    category: "sports",
    badges: ["Clutch Closer"],
  },
  {
    rank: 4,
    username: "StarPredictor",
    points: 6430,
    winRate: 76,
    predictions: 198,
    streak: 5,
    category: "politics",
    badges: ["Debate Sniper"],
  },
  {
    rank: 5,
    username: "InsightHunter",
    points: 5870,
    winRate: 74,
    predictions: 183,
    streak: 6,
    category: "custom",
    badges: ["Theme Specialist"],
  },
  {
    rank: 6,
    username: "MarketWizard",
    points: 5210,
    winRate: 71,
    predictions: 167,
    streak: 4,
    category: "crypto",
    badges: ["Sharp Entry"],
  },
  {
    rank: 7,
    username: "OracleX",
    points: 4780,
    winRate: 69,
    predictions: 154,
    streak: 7,
    category: "sports",
    badges: ["Late Surge"],
  },
  {
    rank: 8,
    username: "BullsEye99",
    points: 4320,
    winRate: 66,
    predictions: 141,
    streak: 3,
    category: "politics",
    badges: ["Fast Reader"],
  },
  {
    rank: 9,
    username: "AlphaCall",
    points: 3950,
    winRate: 63,
    predictions: 129,
    streak: 2,
    category: "custom",
    badges: ["Upset Finder"],
  },
  {
    rank: 10,
    username: "ZenTrader",
    points: 3540,
    winRate: 61,
    predictions: 118,
    streak: 4,
    category: "crypto",
    badges: ["Steady Climber"],
  },
];

function rankEntries(entries: RankedEntry[]) {
  return [...entries]
    .sort((a, b) => b.points - a.points)
    .map((entry, index) => ({
      ...entry,
      rank: index + 1,
    }));
}

function getVisibleEntries(
  entries: RankedEntry[],
  filters: LeaderboardFiltersState
) {
  const filtered = entries.filter((entry) => {
    if (filters.category === "all") {
      return true;
    }

    return entry.category === filters.category;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (filters.sortBy === "win-rate") {
      return b.winRate - a.winRate;
    }

    if (filters.sortBy === "predictions") {
      return b.predictions - a.predictions;
    }

    return b.points - a.points;
  });

  return sorted.map((entry, index) => ({
    ...entry,
    rank: index + 1,
  }));
}

export default function LeaderboardPage() {
  const [filters, setFilters] = useState<LeaderboardFiltersState>({
    timeRange: "weekly",
    category: "all",
    sortBy: "points",
  });
  const [entries, setEntries] = useState(rankEntries(INITIAL_ENTRIES));
  const [lastUpdated, setLastUpdated] = useState(new Date());

  useEffect(() => {
    const interval = window.setInterval(() => {
      setEntries((current) =>
        rankEntries(
          current.map((entry, index) => ({
            ...entry,
            points: entry.points + 18 - index,
            predictions: entry.predictions + (index % 2 === 0 ? 1 : 0),
            winRate: Math.min(
              95,
              Math.max(55, entry.winRate + (index % 3 === 0 ? 1 : 0))
            ),
            streak: entry.streak + (index < 4 ? 1 : 0),
          }))
        )
      );
      setLastUpdated(new Date());
    }, 20000);

    return () => window.clearInterval(interval);
  }, []);

  const visibleEntries = useMemo(
    () => getVisibleEntries(entries, filters),
    [entries, filters]
  );

  const topEntry = visibleEntries[0];
  const hotStreak = [...visibleEntries].sort((a, b) => b.streak - a.streak)[0];

  const overviewStats: StatCardProps[] = [
    {
      label: "Top Performer",
      value: topEntry?.username ?? "n/a",
      supportingText: `${topEntry?.points.toLocaleString() ?? 0} pts - ${filters.timeRange}`,
      icon: <Award className="h-4 w-4" />,
      valueColor: "text-[#F5C451]",
    },
    {
      label: "Live Competitors",
      value: visibleEntries.length.toString(),
      supportingText: "Public rankings currently visible",
      icon: <Activity className="h-4 w-4" />,
      valueColor: "text-[#4FD1C5]",
    },
    {
      label: "Best Win Rate",
      value: `${visibleEntries[0]?.winRate ?? 0}%`,
      supportingText: "Among visible leaderboard entries",
      icon: <TrendingUp className="h-4 w-4" />,
      valueColor: "text-white",
    },
    {
      label: "Hottest Streak",
      value: hotStreak ? `${hotStreak.streak} wins` : "0 wins",
      supportingText: hotStreak?.username ?? "No streak yet",
      icon: <Clock3 className="h-4 w-4" />,
      valueColor: "text-[#A78BFA]",
    },
  ];

  return (
    <div className="relative min-h-screen overflow-x-hidden text-white">
      <PageBackground />

      <div className="relative z-10">
        <Header />

        <main className="mx-auto max-w-7xl px-6 pt-32 pb-16">
          <div className="space-y-8">
            <section className="rounded-[2rem] border border-white/10 bg-[#111726]/80 p-8 backdrop-blur">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div className="max-w-3xl space-y-4">
                  <div className="inline-flex items-center gap-2 rounded-full border border-[#A78BFA]/25 bg-[#A78BFA]/10 px-4 py-2 text-sm font-medium text-[#c9b4ff]">
                    <TrendingUp className="h-4 w-4" />
                    Public rankings
                  </div>
                  <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
                    Track the sharpest predictors on InsightArena
                  </h1>
                  <p className="text-base text-[#9aa4bc] sm:text-lg">
                    Compare win rates, prediction volume, and achievement
                    streaks across the platform with live-updating public
                    rankings.
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-[#0b1220] px-5 py-4 text-sm text-[#cfd8ea]">
                  <p className="font-semibold text-white">Live refresh</p>
                  <p className="mt-1 text-[#8b96b0]">
                    {lastUpdated.toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </div>
            </section>

            <section className="space-y-6">
              <LeaderboardOverview stats={overviewStats} />
              <LeaderboardFilters onChange={setFilters} />

              {topEntry ? (
                <div className="grid gap-6 lg:grid-cols-[minmax(0,1.65fr)_320px]">
                  <LeaderboardTable entries={visibleEntries} />

                  <aside className="h-fit space-y-4 rounded-[1.75rem] border border-white/10 bg-[#111726]/92 p-6 backdrop-blur">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#4FD1C5]">
                        Spotlight
                      </p>
                      <h2 className="mt-3 text-2xl font-semibold text-white">
                        {topEntry.username}
                      </h2>
                      <p className="mt-2 text-sm text-[#8ea0bf]">
                        Leading the board with {topEntry.points.toLocaleString()}{" "}
                        points and a {topEntry.winRate}% hit rate.
                      </p>
                    </div>

                    <div className="grid gap-3">
                      <div className="rounded-2xl border border-white/10 bg-[#0b1220] px-5 py-4">
                        <p className="text-sm text-[#70809f]">Predictions made</p>
                        <p className="mt-2 text-2xl font-bold text-white">
                          {topEntry.predictions}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-[#0b1220] px-5 py-4">
                        <p className="text-sm text-[#70809f]">Current streak</p>
                        <p className="mt-2 text-2xl font-bold text-[#A78BFA]">
                          {topEntry.streak} wins
                        </p>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-[#0b1220] p-5">
                      <p className="text-sm font-semibold text-white">
                        Achievements
                      </p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {topEntry.badges.map((badge) => (
                          <span
                            key={badge}
                            className="rounded-full border border-[#4FD1C5]/20 bg-[#4FD1C5]/10 px-3 py-1 text-xs font-medium text-[#9debe4]"
                          >
                            {badge}
                          </span>
                        ))}
                      </div>
                    </div>
                  </aside>
                </div>
              ) : (
                <div className="rounded-[1.75rem] border border-white/10 bg-[#111726]/90 p-8 text-center text-[#94a3b8]">
                  No leaderboard entries match the selected filters yet.
                </div>
              )}
            </section>
          </div>
        </main>

        <Footer />
      </div>
    </div>
  );
}
