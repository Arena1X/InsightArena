"use client";

import { useState } from "react";
import RewardHistoryTable, {
  RewardHistoryEntry,
} from "@/component/rewards/RewardHistoryTable";
import UpcomingRewards from "@/component/rewards/UpcomingRewards";
import {
  Trophy,
  Star,
  Target,
  TrendingUp,
  Award,
  Zap,
  Crown,
  Flame,
  Medal,
  Gift,
} from "lucide-react";

const MOCK_ENTRIES: RewardHistoryEntry[] = [
  {
    id: "1",
    sourceIcon: "🏆",
    sourceName: "Crypto Cup Q1",
    type: "competition",
    amount: "$120.00",
    status: "claimed",
    date: "Mar 24, 2026",
  },
  {
    id: "2",
    sourceIcon: "📈",
    sourceName: "BTC Price Prediction",
    type: "prediction",
    amount: "$45.50",
    status: "claimed",
    date: "Mar 20, 2026",
  },
  {
    id: "3",
    sourceIcon: "🎁",
    sourceName: "March Airdrop",
    type: "airdrop",
    amount: "50 XLM",
    status: "processing",
    date: "Mar 18, 2026",
  },
  {
    id: "4",
    sourceIcon: "👥",
    sourceName: "Referral Bonus",
    type: "referral",
    amount: "$25.00",
    status: "pending",
    date: "Mar 15, 2026",
  },
  {
    id: "5",
    sourceIcon: "⭐",
    sourceName: "Weekly Bonus",
    type: "bonus",
    amount: "$10.00",
    status: "claimed",
    date: "Mar 10, 2026",
  },
];

interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  isUnlocked: boolean;
  unlockedDate?: string;
}

const ACHIEVEMENTS: Achievement[] = [
  {
    id: "ach-1",
    name: "First Prediction",
    description: "Make your first prediction on any market",
    icon: <Star className="h-6 w-6" />,
    isUnlocked: true,
    unlockedDate: "2026-03-15",
  },
  {
    id: "ach-2",
    name: "Rising Star",
    description: "Win 5 predictions in a row",
    icon: <TrendingUp className="h-6 w-6" />,
    isUnlocked: true,
    unlockedDate: "2026-04-10",
  },
  {
    id: "ach-3",
    name: "Master Predictor",
    description: "Achieve 80% win rate with 50+ predictions",
    icon: <Crown className="h-6 w-6" />,
    isUnlocked: false,
  },
  {
    id: "ach-4",
    name: "Competition Winner",
    description: "Win first place in any competition",
    icon: <Trophy className="h-6 w-6" />,
    isUnlocked: true,
    unlockedDate: "2026-03-24",
  },
  {
    id: "ach-5",
    name: "Consistency Streak",
    description: "Make predictions for 30 consecutive days",
    icon: <Flame className="h-6 w-6" />,
    isUnlocked: false,
  },
  {
    id: "ach-6",
    name: "High Roller",
    description: "Place a single prediction worth 500+ XLM",
    icon: <Zap className="h-6 w-6" />,
    isUnlocked: false,
  },
  {
    id: "ach-7",
    name: "Market Expert",
    description: "Participate in 100+ different markets",
    icon: <Target className="h-6 w-6" />,
    isUnlocked: false,
  },
  {
    id: "ach-8",
    name: "Early Adopter",
    description: "Join during the first month of launch",
    icon: <Award className="h-6 w-6" />,
    isUnlocked: true,
    unlockedDate: "2026-03-01",
  },
  {
    id: "ach-9",
    name: "Top 10 Leaderboard",
    description: "Reach top 10 on the global leaderboard",
    icon: <Medal className="h-6 w-6" />,
    isUnlocked: false,
  },
  {
    id: "ach-10",
    name: "Generous Predictor",
    description: "Refer 10 friends who make predictions",
    icon: <Gift className="h-6 w-6" />,
    isUnlocked: false,
  },
];

export default function RewardsPage() {
  const [entries, setEntries] = useState<RewardHistoryEntry[]>(
    MOCK_ENTRIES.slice(0, 4),
  );
  const [isLoading, setIsLoading] = useState(false);
  const hasMore = entries.length < MOCK_ENTRIES.length;

  function handleLoadMore() {
    setIsLoading(true);
    setTimeout(() => {
      setEntries(MOCK_ENTRIES);
      setIsLoading(false);
    }, 800);
  }

  const handleClaimAll = () => {
    console.log("Claiming all pending rewards");
    // TODO: Implement actual claim logic
  };

  const totalXLMWon = "1,125 XLM";
  const currentSeasonPoints = 1240;
  const currentSeasonRank = 47;
  const pointsToNextTier = 260;
  const nextTierName = "Platinum";
  const progressPercentage =
    (currentSeasonPoints / (currentSeasonPoints + pointsToNextTier)) * 100;

  return (
    <div className="space-y-6">
      {/* Rewards Summary */}
      <section className="grid grid-cols-1 gap-5 md:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-[#121633] p-6">
          <h3 className="text-sm font-medium text-white/90">Total XLM Won</h3>
          <p className="mt-3 text-3xl font-bold text-sky-300">{totalXLMWon}</p>
          <p className="mt-2 text-xs text-gray-400">All time earnings</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-[#121633] p-6">
          <h3 className="text-sm font-medium text-white/90">
            Current Season Points
          </h3>
          <p className="mt-3 text-3xl font-bold text-emerald-300">
            {currentSeasonPoints}
          </p>
          <p className="mt-2 text-xs text-gray-400">Season 2 • Spring 2026</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-[#121633] p-6">
          <h3 className="text-sm font-medium text-white/90">
            Current Season Rank
          </h3>
          <p className="mt-3 text-3xl font-bold text-orange-300">
            #{currentSeasonRank}
          </p>
          <p className="mt-2 text-xs text-gray-400">
            Out of 2,847 participants
          </p>
        </div>
      </section>

      {/* Achievements Grid */}
      <section className="rounded-2xl border border-white/10 bg-[#121633] p-6">
        <h2 className="mb-5 text-lg font-semibold text-white">Achievements</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {ACHIEVEMENTS.map((achievement) => (
            <div
              key={achievement.id}
              className={`rounded-2xl border p-5 transition-all ${
                achievement.isUnlocked
                  ? "border-amber-500/50 bg-gradient-to-br from-amber-500/10 to-amber-600/5 shadow-[0_0_20px_rgba(245,158,11,0.15)]"
                  : "border-white/10 bg-black/20 opacity-60 grayscale"
              }`}
            >
              <div
                className={`mb-3 flex h-12 w-12 items-center justify-center rounded-xl ${
                  achievement.isUnlocked
                    ? "bg-amber-500/20 text-amber-300"
                    : "bg-white/5 text-gray-500"
                }`}
              >
                {achievement.icon}
              </div>
              <h3
                className={`text-sm font-semibold ${
                  achievement.isUnlocked ? "text-white" : "text-gray-400"
                }`}
              >
                {achievement.name}
              </h3>
              <p className="mt-1 text-xs text-gray-400">
                {achievement.description}
              </p>
              {achievement.isUnlocked && achievement.unlockedDate && (
                <p className="mt-2 text-xs font-medium text-amber-400">
                  Unlocked{" "}
                  {new Date(achievement.unlockedDate).toLocaleDateString(
                    "en-US",
                    {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    },
                  )}
                </p>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Season Standings */}
      <section className="rounded-2xl border border-white/10 bg-[#121633] p-6">
        <h2 className="mb-5 text-lg font-semibold text-white">
          Season Standings
        </h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400">Current Season</p>
              <p className="text-xl font-bold text-white">
                Season 2 • Spring 2026
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-400">Your Rank</p>
              <p className="text-xl font-bold text-orange-300">
                #{currentSeasonRank}
              </p>
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="text-gray-300">
                {currentSeasonPoints} points • {pointsToNextTier} to{" "}
                {nextTierName}
              </span>
              <span className="font-semibold text-emerald-300">
                {Math.round(progressPercentage)}%
              </span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-500"
                style={{ width: `${progressPercentage}%` }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Pending Rewards */}
      <section className="rounded-2xl border border-orange-500/40 bg-gradient-to-br from-orange-500/10 to-orange-600/5 p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">
              Pending Rewards
            </h2>
            <p className="mt-1 text-sm text-gray-300">
              You have unclaimed payouts ready
            </p>
          </div>
          <button
            onClick={handleClaimAll}
            className="inline-flex rounded-xl bg-orange-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-orange-600"
          >
            Claim All
          </button>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <p className="text-xs text-gray-400">Prediction Payout</p>
            <p className="mt-1 text-xl font-bold text-emerald-300">
              142.50 XLM
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <p className="text-xs text-gray-400">Competition Reward</p>
            <p className="mt-1 text-xl font-bold text-emerald-300">108 XLM</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <p className="text-xs text-gray-400">Achievement Bonus</p>
            <p className="mt-1 text-xl font-bold text-emerald-300">25 XLM</p>
          </div>
        </div>
      </section>

      {/* Reward History */}
      <RewardHistoryTable
        entries={entries}
        onLoadMore={handleLoadMore}
        hasMore={hasMore}
        isLoading={isLoading}
      />

      {/* Upcoming Rewards */}
      <UpcomingRewards />
    </div>
  );
}
