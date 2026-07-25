"use client";

import { AlertCircle, Loader2, Wallet } from "lucide-react";
import { useWallet } from "@/context/WalletContext";
import { useRewards } from "@/hooks/useRewards";
import RewardStatusBadge from "@/component/rewards/RewardStatusBadge";

function formatXlm(amount: number): string {
  return `${amount.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })} XLM`;
}

function CardShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative rounded-2xl border border-white/10 bg-white/5 p-5 w-full shadow-lg overflow-hidden">
      {/* TOP GOLD EDGE */}
      <div className="absolute top-0 left-0 right-0 h-[3px] bg-yellow-500/60 rounded-t-2xl" />

      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-white font-semibold">Rewards Wallet</h2>
        <Wallet className="h-5 w-5 text-yellow-400" />
      </div>

      {children}
    </div>
  );
}

export default function RewardsWalletCard() {
  const { address, openConnectModal } = useWallet();
  const {
    summary,
    isLoading,
    error,
    refetch,
    claim,
    claimStatus,
    claimError,
    hasClaimableRewards,
    isEmpty,
  } = useRewards();

  // Not connected — nothing to show yet.
  if (!address) {
    return (
      <CardShell>
        <div className="mt-6 text-center">
          <p className="text-gray-400 text-sm">
            Connect your wallet to view claimable and vesting rewards.
          </p>
          <button
            onClick={openConnectModal}
            className="mt-4 w-full py-2 rounded-lg bg-orange-500 text-white font-semibold hover:bg-orange-600 transition"
          >
            Connect Wallet
          </button>
        </div>
      </CardShell>
    );
  }

  // Loading state.
  if (isLoading) {
    return (
      <CardShell>
        <div
          className="mt-5 space-y-4 animate-pulse"
          aria-busy="true"
          aria-live="polite"
        >
          <div className="h-8 w-32 mx-auto rounded bg-white/10" />
          <div className="space-y-3">
            <div className="h-4 w-full rounded bg-white/10" />
            <div className="h-4 w-full rounded bg-white/10" />
            <div className="h-4 w-full rounded bg-white/10" />
          </div>
          <div className="h-9 w-full rounded-lg bg-white/10" />
        </div>
        <span className="sr-only">Loading rewards…</span>
      </CardShell>
    );
  }

  // Error state.
  if (error || !summary) {
    return (
      <CardShell>
        <div className="mt-6 text-center">
          <AlertCircle className="h-6 w-6 text-rose-400 mx-auto" />
          <p className="mt-2 text-rose-300 text-sm">
            {error ?? "Couldn't load rewards."}
          </p>
          <button
            onClick={refetch}
            className="mt-4 w-full py-2 rounded-lg border border-white/10 bg-white/5 text-gray-200 text-sm font-semibold hover:border-orange-500/50 hover:text-orange-400 transition"
          >
            Retry
          </button>
        </div>
      </CardShell>
    );
  }

  // Empty state — connected, but nothing earned yet.
  if (isEmpty) {
    return (
      <CardShell>
        <div className="mt-6 text-center">
          <p className="text-gray-400 text-sm">No rewards yet.</p>
          <p className="text-gray-600 text-xs mt-1">
            Rewards from predictions, competitions and referrals will show up
            here.
          </p>
        </div>
      </CardShell>
    );
  }

  const isPending = claimStatus === "pending";

  return (
    <CardShell>
      {/* Total Earned */}
      <div className="mt-5 text-center">
        <p className="text-gray-400 text-xs tracking-wide">TOTAL EARNED</p>

        <div className="flex items-center justify-center gap-2 mt-1 text-2xl font-bold text-yellow-400">
          <span>⭐</span>
          <span>{formatXlm(summary.totalEarnedXlm)}</span>
          <span>⭐</span>
        </div>
      </div>

      {/* Line Items */}
      <div className="mt-5 space-y-3 text-sm">
        <div className="flex justify-between text-gray-300">
          <span>Claimable Rewards</span>
          <span className="text-orange-400">
            {formatXlm(summary.claimableXlm)}
          </span>
        </div>

        <div className="flex justify-between text-gray-300">
          <span>Vesting Rewards</span>
          <span>{formatXlm(summary.vestingXlm)}</span>
        </div>
      </div>

      {/* Transaction status */}
      {claimStatus !== "idle" && (
        <div className="mt-4 flex justify-center">
          <RewardStatusBadge
            status={
              claimStatus === "pending"
                ? "processing"
                : claimStatus === "success"
                  ? "claimed"
                  : "failed"
            }
          />
        </div>
      )}

      {claimStatus === "error" && claimError && (
        <p className="mt-2 text-center text-xs text-rose-300">{claimError}</p>
      )}

      {claimStatus === "success" && (
        <p className="mt-2 text-center text-xs text-emerald-300">
          Rewards claimed successfully.
        </p>
      )}

      {/* Button */}
      <button
        onClick={claim}
        disabled={!hasClaimableRewards || isPending}
        className="mt-6 w-full py-2 rounded-lg bg-orange-500 text-white font-semibold hover:bg-orange-600 transition disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-orange-500 flex items-center justify-center gap-2"
      >
        {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
        {isPending
          ? "Claiming…"
          : hasClaimableRewards
            ? "Claim Rewards"
            : "Nothing to Claim"}
      </button>
    </CardShell>
  );
}
