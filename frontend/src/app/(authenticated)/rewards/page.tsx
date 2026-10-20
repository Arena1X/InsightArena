"use client";

import { useState } from "react";
import RewardHistoryTable, {
  RewardHistoryEntry,
} from "@/component/rewards/RewardHistoryTable";
import UpcomingRewards from "@/component/rewards/UpcomingRewards";
import RewardStatusBadge from "@/component/rewards/RewardStatusBadge";
import { useWallet } from "@/context/WalletContext";
import { useRewards } from "@/hooks/useRewards";
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
  Loader2,
  AlertCircle,
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

  const { address, openConnectModal } = useWallet();
  const {
    summary: rewardsSummary,
    isLoading: isRewardsLoading,
    error: rewardsError,
    refetch: refetchRewards,
    claim: claimRewards,
    claimStatus,
    claimError,
    hasClaimableRewards,
    isEmpty: hasNoRewards,
  } = useRewards();

  function handleLoadMore() {
    setIsLoading(true);
    setTimeout(() => {
      setEntries(MOCK_ENTRIES);
      setIsLoading(false);
    }, 800);
  }

  const totalXLMWon = "1,125 XLM";
  const currentSeasonPoints = 1240;
  const currentSeasonRank = 47;
  const pointsToNextTier = 260;
  const nextTierName = "Platinum";
  const progressPercentage =
    (currentSeasonPoints / (currentSeasonPoints + pointsToNextTier)) * 100;

  return (
    <div className="space-y-6 p-4 sm:p-6">
      {/* Rewards Summary */}
      <section className="grid grid-cols-1 gap-5 md:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h3 className="text-sm font-medium text-white/90">Total XLM Won</h3>
          <p className="mt-3 text-3xl font-bold text-orange-400">
            {totalXLMWon}
          </p>
          <p className="mt-2 text-xs text-gray-400">All time earnings</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h3 className="text-sm font-medium text-white/90">
            Current Season Points
          </h3>
          <p className="mt-3 text-3xl font-bold text-white">
            {currentSeasonPoints}
          </p>
          <p className="mt-2 text-xs text-gray-400">Season 2 • Spring 2026</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h3 className="text-sm font-medium text-white/90">
            Current Season Rank
          </h3>
          <p className="mt-3 text-3xl font-bold text-orange-400">
            #{currentSeasonRank}
          </p>
          <p className="mt-2 text-xs text-gray-400">
            Out of 2,847 participants
          </p>
        </div>
      </section>

      {/* Achievements Grid */}
      <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <h2 className="mb-5 text-lg font-semibold text-white">Achievements</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {ACHIEVEMENTS.map((achievement) => (
            <div
              key={achievement.id}
              className={`rounded-2xl border p-5 transition-all ${
                achievement.isUnlocked
                  ? "border-white/20 bg-white/5"
                  : "border-white/5 bg-white/[0.02] opacity-50 grayscale"
              }`}
            >
              <div
                className={`mb-3 flex h-12 w-12 items-center justify-center rounded-xl ${
                  achievement.isUnlocked
                    ? "bg-orange-500/10 text-orange-400"
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
                <p className="mt-2 text-xs font-medium text-orange-400">
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
      <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
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
              <p className="text-xl font-bold text-orange-400">
                #{currentSeasonRank}
              </p>
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="text-gray-300">
                {currentSeasonPoints} points • {pointsToNextTier} to{" "}
                {nextTierName}
              </span>
              <span className="font-semibold text-orange-400">
                {Math.round(progressPercentage)}%
              </span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-orange-500/60 transition-all duration-500"
                style={{ width: `${progressPercentage}%` }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Claimable & Vesting Rewards */}
      <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">
              Claimable & Vesting Rewards
            </h2>
            <p className="mt-1 text-sm text-gray-400">
              Rewards earned from predictions, competitions and bonuses
            </p>
          </div>

          {address && !isRewardsLoading && !rewardsError && (
            <button
              onClick={claimRewards}
              disabled={!hasClaimableRewards || claimStatus === "pending"}
              className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {claimStatus === "pending" && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              {claimStatus === "pending"
                ? "Claiming…"
                : hasClaimableRewards
                  ? "Claim All"
                  : "Nothing to Claim"}
            </button>
          )}
        </div>

        {/* Not connected */}
        {!address && (
          <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-gray-400">
            Connect your wallet to view and claim your rewards.
            <button
              onClick={openConnectModal}
              className="ml-2 font-semibold text-orange-400 hover:text-orange-300 transition"
            >
              Connect Wallet
            </button>
          </div>
        )}

        {/* Loading */}
        {address && isRewardsLoading && (
          <div
            className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 animate-pulse"
            aria-busy="true"
          >
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-20 rounded-xl border border-white/10 bg-white/[0.03]"
              />
            ))}
          </div>
        )}

        {/* Error */}
        {address && !isRewardsLoading && rewardsError && (
          <div className="mt-4 flex items-center justify-between gap-4 rounded-xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-300">
            <span className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {rewardsError}
            </span>
            <button
              onClick={refetchRewards}
              className="font-semibold text-rose-200 hover:text-white transition"
            >
              Retry
            </button>
          </div>
        )}

        {/* Empty */}
        {address && !isRewardsLoading && !rewardsError && hasNoRewards && (
          <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-gray-400">
            No rewards yet. Rewards from predictions, competitions and
            referrals will show up here.
          </div>
        )}

        {/* Loaded */}
        {address && !isRewardsLoading && !rewardsError && rewardsSummary && !hasNoRewards && (
          <>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <p className="text-xs text-gray-400">Claimable</p>
                <p className="mt-1 text-xl font-bold text-orange-400">
                  {rewardsSummary.claimableXlm.toLocaleString()} XLM
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <p className="text-xs text-gray-400">Vesting</p>
                <p className="mt-1 text-xl font-bold text-white">
                  {rewardsSummary.vestingXlm.toLocaleString()} XLM
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <p className="text-xs text-gray-400">Total Earned</p>
                <p className="mt-1 text-xl font-bold text-orange-400">
                  {rewardsSummary.totalEarnedXlm.toLocaleString()} XLM
                </p>
              </div>
            </div>

            {claimStatus !== "idle" && (
              <div className="mt-4 flex items-center gap-3">
                <RewardStatusBadge
                  status={
                    claimStatus === "pending"
                      ? "processing"
                      : claimStatus === "success"
                        ? "claimed"
                        : "failed"
                  }
                />
                {claimStatus === "error" && claimError && (
                  <span className="text-xs text-rose-300">{claimError}</span>
                )}
                {claimStatus === "success" && (
                  <span className="text-xs text-emerald-300">
                    Rewards claimed successfully.
                  </span>
                )}
              </div>
            )}
          </>
        )}
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
