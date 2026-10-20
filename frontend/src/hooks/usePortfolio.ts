"use client";

import { useCallback, useEffect, useState } from "react";
import { apiClient } from "@/lib/api";
import { logHookError } from "@/hooks/useHookErrorMessage";

export type PositionStatus = "open" | "settled";

export interface Position {
  id: string;
  market_id: string;
  market_title: string;
  outcome: string;
  stake: string;
  current_value: string;
  pnl: string;
  status: PositionStatus;
  placed_at: string;
  resolved_at: string | null;
}

export interface PortfolioResponse {
  data: Position[];
  total: number;
  page: number;
  limit: number;
}

export type SortField = "stake" | "current_value" | "pnl";
export type SortDirection = "asc" | "desc";
export type TimeRange = "7d" | "30d" | "all";

// P/L History data point for chart
export interface PnlHistoryPoint {
  date: string; // ISO date string
  timestamp: number; // Unix timestamp
  realized_pnl: number; // in stroops
  unrealized_pnl: number; // in stroops
  total_pnl: number; // in stroops
  portfolio_value: number; // in stroops
}

export interface PnlHistoryResponse {
  data: PnlHistoryPoint[];
  range: TimeRange;
  summary: {
    total_realized: number;
    total_unrealized: number;
    total_pnl: number;
    current_portfolio_value: number;
  };
}

export type EmptyStateReason =
  | "no-address"
  | "no-positions"
  | "no-filtered-positions"
  | "loading"
  | "error";

interface UsePortfolioOptions {
  address: string;
  status?: PositionStatus;
  sortBy?: SortField;
  sortDir?: SortDirection;
  page?: number;
  limit?: number;
}

interface UsePortfolioReturn {
  positions: Position[];
  total: number;
  isLoading: boolean;
  error: string | null;
  isEmpty: boolean;
  emptyStateReason: EmptyStateReason | null;
  hasFilters: boolean;
  refetch: () => void;
  clearFilters: () => void;
}

interface UsePnlHistoryOptions {
  address: string;
  range: TimeRange;
}

interface UsePnlHistoryReturn {
  history: PnlHistoryPoint[];
  summary: PnlHistoryResponse["summary"] | null;
  isLoading: boolean;
  error: string | null;
  isEmpty: boolean;
  emptyStateReason: EmptyStateReason | null;
  refetch: () => void;
}

export function usePortfolio({
  address,
  status,
  sortBy = "stake",
  sortDir = "desc",
  page = 1,
  limit = 20,
}: UsePortfolioOptions): UsePortfolioReturn {
  const [positions, setPositions] = useState<Position[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasInitialLoad, setHasInitialLoad] = useState(false);

  const hasFilters = Boolean(status);

  const fetchPositions = useCallback(async () => {
    if (!address) {
      setIsLoading(false);
      setHasInitialLoad(true);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", String(limit));
      params.set("sort_by", sortBy);
      params.set("sort_dir", sortDir);
      if (status) params.set("status", status);

      const result = await apiClient.get<PortfolioResponse>(
        `/api/v1/predictions/portfolio/${encodeURIComponent(address)}?${params.toString()}`,
      );
      setPositions(result.data);
      setTotal(result.total);
      setHasInitialLoad(true);
    } catch (err) {
      setError(
        logHookError(err, {
          fallbackMessage: "Failed to load portfolio.",
          hookName: "usePortfolio",
          id: address,
        }),
      );
      setHasInitialLoad(true);
    } finally {
      setIsLoading(false);
    }
  }, [address, status, sortBy, sortDir, page, limit]);

  const clearFilters = useCallback(() => {
    // This is a helper function that consumers can use
    // The actual filter clearing would be handled by parent component
    // by resetting the status prop, but we provide this for convenience
  }, []);

  useEffect(() => {
    fetchPositions();
  }, [fetchPositions]);

  // Determine empty state reason
  let emptyStateReason: EmptyStateReason | null = null;
  const isEmpty = positions.length === 0;

  if (!hasInitialLoad || isLoading) {
    emptyStateReason = "loading";
  } else if (error) {
    emptyStateReason = "error";
  } else if (!address) {
    emptyStateReason = "no-address";
  } else if (isEmpty && hasFilters) {
    emptyStateReason = "no-filtered-positions";
  } else if (isEmpty && !hasFilters) {
    emptyStateReason = "no-positions";
  }

  return {
    positions,
    total,
    isLoading,
    error,
    isEmpty,
    emptyStateReason,
    hasFilters,
    refetch: fetchPositions,
    clearFilters,
  };
}

/**
 * Hook to fetch P/L history over time for a given address and time range.
 * Returns historical data points for charting and a summary of totals.
 */
export function usePnlHistory({
  address,
  range,
}: UsePnlHistoryOptions): UsePnlHistoryReturn {
  const [history, setHistory] = useState<PnlHistoryPoint[]>([]);
  const [summary, setSummary] = useState<PnlHistoryResponse["summary"] | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasInitialLoad, setHasInitialLoad] = useState(false);

  const fetchHistory = useCallback(async () => {
    if (!address) {
      setIsLoading(false);
      setHasInitialLoad(true);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await apiClient.get<PnlHistoryResponse>(
        `/api/v1/predictions/portfolio/${encodeURIComponent(address)}/pnl-history?range=${range}`,
      );
      setHistory(result.data);
      setSummary(result.summary);
      setHasInitialLoad(true);
    } catch (err) {
      setError(
        logHookError(err, {
          fallbackMessage: "Failed to load P/L history.",
          hookName: "usePnlHistory",
          id: address,
        }),
      );
      setHasInitialLoad(true);
    } finally {
      setIsLoading(false);
    }
  }, [address, range]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // Determine empty state reason
  let emptyStateReason: EmptyStateReason | null = null;
  const isEmpty = history.length === 0;

  if (!hasInitialLoad || isLoading) {
    emptyStateReason = "loading";
  } else if (error) {
    emptyStateReason = "error";
  } else if (!address) {
    emptyStateReason = "no-address";
  } else if (isEmpty) {
    emptyStateReason = "no-positions";
  }

  return {
    history,
    summary,
    isLoading,
    error,
    isEmpty,
    emptyStateReason,
    refetch: fetchHistory,
  };
}
