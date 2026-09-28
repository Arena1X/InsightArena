"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useWallet } from "@/context/WalletContext";
import {
  dismissCoachInsight,
  getCoachInsights,
  getInsightId,
  getIsoWeekString,
  isCoachInsightHidden,
  snoozeCoachInsight,
  type CoachInsightsResponse,
} from "@/lib/coach";
import { logHookError } from "./useHookErrorMessage";

export interface UseCoachInsightsReturn {
  insights: CoachInsightsResponse | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
  hasHistory: boolean;
  /** True when the current insight exists but was dismissed/snoozed away. */
  isHidden: boolean;
  /** Permanently dismiss the current weekly insight for this wallet. */
  dismiss: () => void;
  /** Snooze the current weekly insight until next week for this wallet. */
  snooze: () => void;
}

export function useCoachInsights(): UseCoachInsightsReturn {
  const { address, token } = useWallet();
  const [insights, setInsights] = useState<CoachInsightsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Bumped on dismiss/snooze so the hidden check below re-reads storage.
  const [lifecycleVersion, setLifecycleVersion] = useState(0);

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

  const generatedAt = insights?.insights?.generated_at ?? null;

  const insightId = useMemo(
    () => (generatedAt ? getInsightId(generatedAt) : null),
    [generatedAt],
  );

  const currentWeek = useMemo(() => getIsoWeekString(new Date()), []);

  const isHidden = useMemo(() => {
    // Referencing lifecycleVersion forces a re-check after dismiss/snooze.
    void lifecycleVersion;
    if (!insightId || !currentWeek) return false;
    return isCoachInsightHidden(address, insightId, currentWeek);
  }, [address, insightId, currentWeek, lifecycleVersion]);

  const dismiss = useCallback(() => {
    if (!insightId) return;
    dismissCoachInsight(address, insightId);
    setLifecycleVersion((v) => v + 1);
  }, [address, insightId]);

  const snooze = useCallback(() => {
    if (!insightId || !currentWeek) return;
    snoozeCoachInsight(address, insightId, currentWeek);
    setLifecycleVersion((v) => v + 1);
  }, [address, insightId, currentWeek]);

  const hasHistory = Boolean(insights?.has_history && insights.insights);

  return {
    insights,
    isLoading,
    error,
    refetch: fetchInsights,
    hasHistory,
    isHidden,
    dismiss,
    snooze,
  };
}
