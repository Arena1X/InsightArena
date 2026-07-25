"use client";

import { useCallback, useEffect, useState } from "react";
import { useWallet } from "@/context/WalletContext";
import {
  claimRewards,
  getRewardsSummary,
  type RewardsSummary,
} from "@/lib/rewards";
import { logHookError } from "./useHookErrorMessage";

export type ClaimStatus = "idle" | "pending" | "success" | "error";

export interface UseRewardsReturn {
  summary: RewardsSummary | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;

  claim: () => Promise<void>;
  claimStatus: ClaimStatus;
  claimError: string | null;
  lastClaimedXlm: number | null;
  lastTransactionHash: string | null;

  hasClaimableRewards: boolean;
  isEmpty: boolean;
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

  const fetchSummary = useCallback(async () => {
    if (!address || !token) {
      setSummary(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const result = await getRewardsSummary(token);
      setSummary(result);
    } catch (err) {
      setSummary(null);
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
    hasClaimableRewards,
    isEmpty,
  };
}
