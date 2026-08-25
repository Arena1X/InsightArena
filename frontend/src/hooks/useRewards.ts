"use client";

import { useCallback, useEffect, useState } from "react";
import { useWallet } from "@/context/WalletContext";
import {
  claimRewardItem,
  claimRewards,
  getRewardItems,
  getRewardsSummary,
  type RewardItem,
  type RewardsSummary,
} from "@/lib/rewards";
import { logHookError } from "./useHookErrorMessage";

export type ClaimStatus = "idle" | "pending" | "success" | "error";
export type ItemClaimStatus = "idle" | "pending" | "success" | "error";

/** A reward item decorated with its own, independently-tracked claim state. */
export interface WalletRewardItem extends RewardItem {
  claimStatus: ItemClaimStatus;
  claimError: string | null;
}

export interface UseRewardsReturn {
  summary: RewardsSummary | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;

  // Whole-summary claim (claims everything in one backend call).
  claim: () => Promise<void>;
  claimStatus: ClaimStatus;
  claimError: string | null;
  lastClaimedXlm: number | null;
  lastTransactionHash: string | null;

  // Per-item claimable/vesting rewards.
  items: WalletRewardItem[];
  claimableItems: WalletRewardItem[];
  vestingItems: WalletRewardItem[];
  claimItem: (itemId: string) => Promise<void>;
  claimAllItems: () => Promise<void>;
  isClaimingAll: boolean;

  hasClaimableRewards: boolean;
  isEmpty: boolean;
}

function decorateItem(item: RewardItem): WalletRewardItem {
  return { ...item, claimStatus: "idle", claimError: null };
}

export function useRewards(): UseRewardsReturn {
  const { address, token } = useWallet();
  const [summary, setSummary] = useState<RewardsSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [claimStatus, setClaimStatus] = useState<ClaimStatus>("idle");
  const [claimError, setClaimError] = useState<string | null>(null);
  const [lastClaimedXlm, setLastClaimedXlm] = useState<number | null>(null);
  const [lastTransactionHash, setLastTransactionHash] = useState<
    string | null
  >(null);

  const [items, setItems] = useState<WalletRewardItem[]>([]);
  const [isClaimingAll, setIsClaimingAll] = useState(false);

  const fetchSummary = useCallback(async () => {
    if (!address || !token) {
      setSummary(null);
      setItems([]);
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const [summaryResult, itemsResult] = await Promise.all([
        getRewardsSummary(token),
        getRewardItems(token),
      ]);
      setSummary(summaryResult);
      setItems(itemsResult.map(decorateItem));
    } catch (err) {
      setSummary(null);
      setItems([]);
      setError(
        logHookError(err, {
          fallbackMessage: "Failed to load rewards.",
          hookName: "useRewards",
          id: address,
        }),
      );
    } finally {
      setIsLoading(false);
    }
  }, [address, token]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  // Claim status resets whenever the connected wallet changes.
  useEffect(() => {
    setClaimStatus("idle");
    setClaimError(null);
    setLastClaimedXlm(null);
    setLastTransactionHash(null);
    setIsClaimingAll(false);
  }, [address]);

  const claim = useCallback(async () => {
    if (!address || !token) {
      setClaimStatus("error");
      setClaimError("Connect a wallet to claim rewards.");
      return;
    }
    if (!summary || summary.claimableXlm <= 0) {
      return;
    }

    setClaimStatus("pending");
    setClaimError(null);
    try {
      const result = await claimRewards(token);
      setSummary(result.summary);
      setLastClaimedXlm(result.claimedXlm);
      setLastTransactionHash(result.transactionHash);
      setClaimStatus("success");
    } catch (err) {
      setClaimStatus("error");
      setClaimError(
        logHookError(err, {
          fallbackMessage: "Failed to claim rewards. Please try again.",
          hookName: "useRewards.claim",
          id: address,
        }),
      );
    }
  }, [address, token, summary]);

  const claimItem = useCallback(
    async (itemId: string) => {
      if (!address || !token) return;

      const target = items.find((item) => item.id === itemId);
      if (
        !target ||
        target.status !== "claimable" ||
        target.claimStatus === "pending"
      ) {
        return;
      }

      setItems((current) =>
        current.map((item) =>
          item.id === itemId
            ? { ...item, claimStatus: "pending", claimError: null }
            : item,
        ),
      );

      try {
        const result = await claimRewardItem(token, itemId);
        setItems((current) => current.filter((item) => item.id !== itemId));
        setSummary((current) =>
          current
            ? {
                ...current,
                claimableXlm: Math.max(
                  0,
                  current.claimableXlm - target.amountXlm,
                ),
                totalEarnedXlm: current.totalEarnedXlm + result.claimedXlm,
              }
            : current,
        );
      } catch (err) {
        const message = logHookError(err, {
          fallbackMessage: "Failed to claim this reward. Please try again.",
          hookName: "useRewards.claimItem",
          id: itemId,
        });
        setItems((current) =>
          current.map((item) =>
            item.id === itemId
              ? { ...item, claimStatus: "error", claimError: message }
              : item,
          ),
        );
        throw err;
      }
    },
    [address, token, items],
  );

  const claimAllItems = useCallback(async () => {
    if (!address || !token || isClaimingAll) return;

    const claimableIds = items
      .filter(
        (item) => item.status === "claimable" && item.claimStatus !== "pending",
      )
      .map((item) => item.id);

    if (claimableIds.length === 0) return;

    setIsClaimingAll(true);
    try {
      for (const itemId of claimableIds) {
        try {
          await claimItem(itemId);
        } catch {
          // Per-item error is already recorded on the item; keep claiming the rest.
        }
      }
    } finally {
      setIsClaimingAll(false);
    }
  }, [address, token, items, claimItem, isClaimingAll]);

  const claimableItems = items.filter((item) => item.status === "claimable");
  const vestingItems = items.filter((item) => item.status === "vesting");

  const hasClaimableRewards = Boolean(summary && summary.claimableXlm > 0);
  const isEmpty = Boolean(
    summary &&
      summary.claimableXlm <= 0 &&
      summary.vestingXlm <= 0 &&
      summary.totalEarnedXlm <= 0,
  );

  return {
    summary,
    isLoading,
    error,
    refetch: fetchSummary,
    claim,
    claimStatus,
    claimError,
    lastClaimedXlm,
    lastTransactionHash,
    items,
    claimableItems,
    vestingItems,
    claimItem,
    claimAllItems,
    isClaimingAll,
    hasClaimableRewards,
    isEmpty,
  };
}
