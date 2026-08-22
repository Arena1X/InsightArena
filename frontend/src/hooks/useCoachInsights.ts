"use client";

import { useCallback, useEffect, useState } from "react";
import { useWallet } from "@/context/WalletContext";
import { getCoachInsights, type CoachInsightsResponse } from "@/lib/coach";
import { logHookError } from "./useHookErrorMessage";

export interface UseCoachInsightsReturn {
  insights: CoachInsightsResponse | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
  hasHistory: boolean;
}

export function useCoachInsights(): UseCoachInsightsReturn {
  const { address, token } = useWallet();
  const [insights, setInsights] = useState<CoachInsightsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchInsights = useCallback(async () => {
    if (!address || !token) {
      setInsights(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const result = await getCoachInsights(token);
      setInsights(result);
    } catch (err) {
      setInsights(null);
      setError(
        logHookError(err, {
          fallbackMessage: "Failed to load coach insights.",
          hookName: "useCoachInsights",
          id: address,
        }),
      );
    } finally {
      setIsLoading(false);
    }
  }, [address, token]);

  useEffect(() => {
    fetchInsights();
  }, [fetchInsights]);

  const hasHistory = Boolean(insights?.has_history && insights.insights);

  return {
    insights,
    isLoading,
    error,
    refetch: fetchInsights,
    hasHistory,
  };
}
