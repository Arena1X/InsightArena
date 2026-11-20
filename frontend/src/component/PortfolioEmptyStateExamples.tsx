"use client";

import { usePortfolio, usePnlHistory } from "@/hooks/usePortfolio";
import type { PositionStatus, TimeRange } from "@/hooks/usePortfolio";

/**
 * Example component demonstrating comprehensive empty state handling for portfolio
 */
export function PortfolioWithEmptyStates({
  address,
  status,
}: {
  address: string;
  status?: PositionStatus;
}) {
  const {
    positions,
    total,
    isLoading,
    error,
    isEmpty,
    emptyStateReason,
    hasFilters,
    refetch,
    clearFilters,
  } = usePortfolio({
    address,
    status,
  });

  // Render appropriate empty state based on reason
  const renderEmptyState = () => {
    switch (emptyStateReason) {
      case "loading":
        return (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            <p className="mt-4 text-sm text-muted-foreground">
              Loading your portfolio...
            </p>
          </div>
        );

      case "error":
        return (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="rounded-full bg-destructive/10 p-3">
              <svg
                className="h-6 w-6 text-destructive"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <h3 className="mt-4 text-lg font-semibold">Failed to load portfolio</h3>
            <p className="mt-2 text-sm text-muted-foreground">{error}</p>
            <button
              onClick={refetch}
              className="mt-4 rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Try Again
            </button>
          </div>
        );

      case "no-address":
        return (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="rounded-full bg-muted p-3">
              <svg
                className="h-6 w-6 text-muted-foreground"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
                />
              </svg>
            </div>
            <h3 className="mt-4 text-lg font-semibold">Connect your wallet</h3>
            <p className="mt-2 text-center text-sm text-muted-foreground">
              Connect your wallet to view your prediction portfolio
            </p>
            <button className="mt-4 rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              Connect Wallet
            </button>
          </div>
        );

      case "no-filtered-positions":
        return (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="rounded-full bg-muted p-3">
              <svg
                className="h-6 w-6 text-muted-foreground"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
                />
              </svg>
            </div>
            <h3 className="mt-4 text-lg font-semibold">No matching positions</h3>
            <p className="mt-2 text-center text-sm text-muted-foreground">
              No positions found with the current filters.
              <br />
              Try adjusting your filters or view all positions.
            </p>
            <button
              onClick={clearFilters}
              className="mt-4 rounded border px-4 py-2 text-sm font-medium hover:bg-accent"
            >
              Clear Filters
            </button>
          </div>
        );

      case "no-positions":
        return (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="rounded-full bg-muted p-3">
              <svg
                className="h-6 w-6 text-muted-foreground"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                />
              </svg>
            </div>
            <h3 className="mt-4 text-lg font-semibold">No predictions yet</h3>
            <p className="mt-2 text-center text-sm text-muted-foreground">
              You haven't made any predictions yet.
              <br />
              Start exploring markets and make your first prediction!
            </p>
            <button className="mt-4 rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              Explore Markets
            </button>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Portfolio</h2>
        {hasFilters && !isEmpty && (
          <span className="text-sm text-muted-foreground">
            Showing {status} positions
          </span>
        )}
      </div>

      {/* Content or Empty State */}
      {isEmpty ? (
        renderEmptyState()
      ) : (
        <div className="space-y-3">
          <div className="text-sm text-muted-foreground">
            {total} position{total !== 1 ? "s" : ""} found
          </div>
          {positions.map((position) => (
            <div
              key={position.id}
              className="rounded-lg border p-4"
            >
              <h3 className="font-semibold">{position.market_title}</h3>
              <div className="mt-2 grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Stake:</span>{" "}
                  <span className="font-medium">{position.stake}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Current Value:</span>{" "}
                  <span className="font-medium">{position.current_value}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">P/L:</span>{" "}
                  <span
                    className={`font-medium ${
                      parseFloat(position.pnl) >= 0
                        ? "text-green-600"
                        : "text-red-600"
                    }`}
                  >
                    {position.pnl}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Status:</span>{" "}
                  <span className="font-medium capitalize">{position.status}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Example component for P/L history with empty state handling
 */
export function PnlHistoryWithEmptyStates({
  address,
  range,
}: {
  address: string;
  range: TimeRange;
}) {
  const {
    history,
    summary,
    isLoading,
    error,
    isEmpty,
    emptyStateReason,
    refetch,
  } = usePnlHistory({
    address,
    range,
  });

  const renderEmptyState = () => {
    switch (emptyStateReason) {
      case "loading":
        return (
          <div className="flex items-center justify-center py-8">
            <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            <span className="ml-3 text-sm text-muted-foreground">
              Loading P/L history...
            </span>
          </div>
        );

      case "error":
        return (
          <div className="flex flex-col items-center justify-center py-8">
            <p className="text-sm text-destructive">{error}</p>
            <button
              onClick={refetch}
              className="mt-3 rounded border px-3 py-1.5 text-sm font-medium hover:bg-accent"
            >
              Retry
            </button>
          </div>
        );

      case "no-address":
        return (
          <div className="flex items-center justify-center py-8">
            <p className="text-sm text-muted-foreground">
              Connect wallet to view P/L history
            </p>
          </div>
        );

      case "no-positions":
        return (
          <div className="flex flex-col items-center justify-center py-8">
            <p className="text-sm text-muted-foreground">
              No prediction history for this time range
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Make some predictions to see your performance over time
            </p>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">P/L History ({range})</h3>

      {summary && !isEmpty && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Total Realized</p>
            <p className="mt-1 text-lg font-semibold">
              {(summary.total_realized / 10_000_000).toFixed(2)} XLM
            </p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Total Unrealized</p>
            <p className="mt-1 text-lg font-semibold">
              {(summary.total_unrealized / 10_000_000).toFixed(2)} XLM
            </p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Total P/L</p>
            <p
              className={`mt-1 text-lg font-semibold ${
                summary.total_pnl >= 0 ? "text-green-600" : "text-red-600"
              }`}
            >
              {(summary.total_pnl / 10_000_000).toFixed(2)} XLM
            </p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Portfolio Value</p>
            <p className="mt-1 text-lg font-semibold">
              {(summary.current_portfolio_value / 10_000_000).toFixed(2)} XLM
            </p>
          </div>
        </div>
      )}

      {isEmpty ? (
        renderEmptyState()
      ) : (
        <div className="rounded-lg border p-4">
          <div className="text-sm text-muted-foreground">
            {history.length} data point{history.length !== 1 ? "s" : ""}
          </div>
          {/* Chart would go here */}
          <div className="mt-4 text-center text-sm text-muted-foreground">
            [Chart visualization of P/L history over time]
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Compact empty state example for inline usage
 */
export function CompactPortfolioEmpty({ reason }: { reason: string }) {
  const messages = {
    "no-address": "Connect wallet to view portfolio",
    "no-positions": "No predictions yet",
    "no-filtered-positions": "No matching positions",
    error: "Failed to load",
    loading: "Loading...",
  };

  return (
    <div className="rounded-lg border border-dashed p-6 text-center">
      <p className="text-sm text-muted-foreground">
        {messages[reason as keyof typeof messages] || "No data"}
      </p>
    </div>
  );
}
