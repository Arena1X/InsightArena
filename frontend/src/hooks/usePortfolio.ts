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

  const fetchPositions = useCallback(async () => {
    if (!address) return;
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
    } catch (err) {
      setError(
        logHookError(err, {
          fallbackMessage: "Failed to load portfolio.",
          hookName: "usePortfolio",
          id: address,
        }),
      );
    } finally {
      setIsLoading(false);
    }
  }, [address, status, sortBy, sortDir, page, limit]);

  useEffect(() => {
    fetchPositions();
  }, [fetchPositions]);

  return { positions, total, isLoading, error, refetch: fetchPositions };
}
