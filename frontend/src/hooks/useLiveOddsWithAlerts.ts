"use client";

import { useEffect, useRef } from "react";
import { useLiveOdds, type UseLiveOddsResult } from "./useLiveOdds";
import { usePriceAlerts } from "@/context/PriceAlertContext";

/**
 * Enhanced version of useLiveOdds that automatically checks price alerts
 * when odds change. Prevents false alerts on initial load by tracking
 * whether we've seen odds before.
 */
export function useLiveOddsWithAlerts(
  marketId: string | null | undefined,
): UseLiveOddsResult {
  const liveOddsResult = useLiveOdds(marketId);
  const { checkAlert } = usePriceAlerts();

  const previousOddsRef = useRef<{
    yesOdds: number;
    noOdds: number;
  } | null>(null);

  const hasInitialLoadedRef = useRef(false);

  useEffect(() => {
    if (!marketId || !liveOddsResult.odds) {
      return;
    }

    const { yesOdds, noOdds } = liveOddsResult.odds;

    // On first load, just record the odds without triggering alerts
    if (!hasInitialLoadedRef.current) {
      previousOddsRef.current = { yesOdds, noOdds };
      hasInitialLoadedRef.current = true;
      return;
    }

    // Check for alert triggers only if we have previous odds
    if (previousOddsRef.current) {
      checkAlert(
        marketId,
        yesOdds,
        noOdds,
        previousOddsRef.current.yesOdds,
        previousOddsRef.current.noOdds,
      );
    }

    // Update previous odds for next comparison
    previousOddsRef.current = { yesOdds, noOdds };
  }, [marketId, liveOddsResult.odds, checkAlert]);

  // Reset initial load flag when market changes
  useEffect(() => {
    hasInitialLoadedRef.current = false;
    previousOddsRef.current = null;
  }, [marketId]);

  return liveOddsResult;
}
