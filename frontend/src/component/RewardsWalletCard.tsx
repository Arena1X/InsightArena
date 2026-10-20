"use client";

import { AlertCircle, Clock, Loader2, Wallet } from "lucide-react";
import { useWallet } from "@/context/WalletContext";
import { useRewards, type WalletRewardItem } from "@/hooks/useRewards";

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

interface ClaimableRewardRowProps {
  item: WalletRewardItem;
  onClaim: (itemId: string) => void;
  disabled: boolean;
}

function ClaimableRewardRow({ item, onClaim, disabled }: ClaimableRewardRowProps) {
  const isPending = item.claimStatus === "pending";

  return (
    <li className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm text-gray-200">{item.marketTitle}</p>
          <p className="text-xs text-orange-400 font-medium">
            {formatXlm(item.amountXlm)}
          </p>
        </div>

        <button
          onClick={() => onClaim(item.id)}
          disabled={disabled || isPending}
          className="flex-shrink-0 flex items-center gap-1.5 rounded-md bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-orange-500"
        >
          {isPending && <Loader2 className="h-3 w-3 animate-spin" />}
          {isPending ? "Claiming…" : "Claim"}
        </button>
      </div>

      {item.claimStatus === "error" && item.claimError && (
        <p className="mt-1.5 text-xs text-rose-300">{item.claimError}</p>
      )}
    </li>
  );
}

function VestingRewardRow({ item }: { item: WalletRewardItem }) {
  return (
    <li className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <p className="truncate text-sm text-gray-300">{item.marketTitle}</p>
        <div className="flex-shrink-0 flex items-center gap-1.5 text-xs text-gray-400">
          <Clock className="h-3 w-3" />
          <span>{formatXlm(item.amountXlm)}</span>
        </div>
      </div>
    </li>
  );
}

export default function RewardsWalletCard() {
  const { address, openConnectModal } = useWallet();
  const {
    summary,
    isLoading,
    error,
    refetch,
    claimableItems,
    vestingItems,
    claimItem,
    claimAllItems,
    isClaimingAll,
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

      {/* Claimable Rewards */}
      <div className="mt-5">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            Claimable ({claimableItems.length})
          </h3>
          {claimableItems.length > 0 && (
            <button
              onClick={claimAllItems}
              disabled={!hasClaimableRewards || isClaimingAll}
              className="flex items-center gap-1.5 rounded-md bg-orange-500/15 border border-orange-500/30 px-2.5 py-1 text-xs font-semibold text-orange-400 transition hover:bg-orange-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isClaimingAll && <Loader2 className="h-3 w-3 animate-spin" />}
              {isClaimingAll ? "Claiming All…" : "Claim All"}
            </button>
          )}
        </div>

        {claimableItems.length === 0 ? (
          <p className="mt-2 text-xs text-gray-500">
            Nothing claimable right now.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {claimableItems.map((item) => (
              <ClaimableRewardRow
                key={item.id}
                item={item}
                onClaim={claimItem}
                disabled={isClaimingAll}
              />
            ))}
          </ul>
        )}
      </div>

      {/* Vesting Rewards */}
      <div className="mt-5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
          Vesting ({vestingItems.length})
        </h3>

        {vestingItems.length === 0 ? (
          <p className="mt-2 text-xs text-gray-500">No rewards vesting.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {vestingItems.map((item) => (
              <VestingRewardRow key={item.id} item={item} />
            ))}
          </ul>
        )}
      </div>
    </CardShell>
  );
}
