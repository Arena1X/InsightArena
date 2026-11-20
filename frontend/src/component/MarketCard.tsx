import React from "react";
import { Heart, WifiOff } from "lucide-react";
import Link from "next/link";
import { Sparkline } from "./Sparkline";
import { useCountdown } from "../hooks/useCountdown";
import type { ConnectionStatus } from "../hooks/useLiveOdds";

type Market = {
  id: string;
  title: string;
  category: string;
  probability: number;
  totalStaked: number;
  closeAt: string;
  status: string;
};

export default function MarketCard({
  market,
  onPredict,
  isFavorite = false,
  onFavoriteToggle,
  preview = false,
  sparklineData,
  connectionStatus,
  isStale = false,
}: {
  market: Market;
  onPredict: () => void;
  isFavorite?: boolean;
  onFavoriteToggle?: () => void;
  /** Renders a static, non-navigating preview (e.g. in the create-market form). */
  preview?: boolean;
  sparklineData?: number[];
  connectionStatus?: ConnectionStatus;
  isStale?: boolean;
}) {
  const probabilityPct = Math.round((market.probability || 0) * 100);

  const isResolved = market.status === "resolved";
  const countdown = useCountdown(market.closeAt, { frozen: isResolved });

  const status = isResolved
    ? "resolved"
    : countdown.isExpired
      ? "closed"
      : countdown.remainingMs < 60 * 60 * 1000
        ? "closing-soon"
        : "open";

  const STATUS_LABELS: Record<string, string> = {
    open: "Open",
    "closing-soon": "Closing soon",
    closed: "Closed",
    resolved: "Resolved",
  };

  function statusColor(status: string) {
    if (status === "open")
      return "bg-green-500/20 text-green-300 border-green-700/40";
    if (status === "closing-soon")
      return "bg-yellow-500/10 text-yellow-300 border-yellow-700/30";
    if (status === "closed")
      return "bg-red-500/10 text-red-300 border-red-700/30";
    return "bg-blue-500/10 text-blue-300 border-blue-700/30";
  }

  const showStaleBadge =
    !preview &&
    (isStale || connectionStatus === "disconnected" || connectionStatus === "connecting");
  const staleBadgeLabel =
    connectionStatus === "disconnected" || connectionStatus === "connecting"
      ? "Reconnecting"
      : "Stale";

  const cardContent = (
    <>
      {preview && (
        <span className="absolute right-3 top-3 rounded-full bg-orange-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-orange-300">
          Preview
        </span>
      )}
      {showStaleBadge && (
        <span
          data-testid="stale-odds-badge"
          className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full border border-yellow-600/40 bg-yellow-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-yellow-300"
        >
          <WifiOff size={10} />
          {staleBadgeLabel}
        </span>
      )}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-white">
              {market.title}
            </span>
            {onFavoriteToggle && (
              <button
                onClick={onFavoriteToggle}
                className="transition-colors hover:text-red-400"
                aria-label={
                  isFavorite ? "Remove from favorites" : "Add to favorites"
                }
              >
                <Heart
                  size={18}
                  className={
                    isFavorite ? "fill-red-500 text-red-500" : "text-white/50"
                  }
                />
              </button>
            )}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <span className="rounded-full bg-white/5 px-2 py-0.5 text-xs font-medium text-gray-200">
              {market.category}
            </span>
            <span
              data-testid="market-status-badge"
              className={`ml-auto inline-flex items-center gap-2 rounded-full border px-2 py-0.5 text-xs ${statusColor(status)}`}
            >
              {STATUS_LABELS[status]}
            </span>
          </div>

          <div className="mt-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-300">Yes Probability</div>
                <div className="text-lg font-semibold text-white">
                  {probabilityPct}%
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                {sparklineData && <Sparkline data={sparklineData} />}
                <div className="text-right text-sm text-gray-400">
                  <div>{market.totalStaked.toFixed(2)} XLM</div>
                  <div className="mt-1 text-xs" data-testid="market-countdown">
                    {isResolved ? "Resolved" : countdown.label}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-3 h-2 w-full rounded-full bg-white/5">
              <div
                className="h-2 rounded-full bg-green-400"
                style={{ width: `${probabilityPct}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <button
          onClick={(e) => { e.preventDefault(); onPredict(); }}
          disabled={preview}
          className="ml-auto rounded-md bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:cursor-default disabled:opacity-60"
        >
          Predict
        </button>
      </div>
    </>
  );

  if (preview) {
    return (
      <div className="relative block min-h-[220px] rounded-xl border border-white/6 bg-white/3 p-4">
        {cardContent}
      </div>
    );
  }

  return (
    <Link
      href={`/markets/${market.id}`}
      className="relative block min-h-[220px] rounded-xl border border-white/6 bg-white/3 p-4 hover:border-white/20 transition-colors"
    >
      {cardContent}
    </Link>
  );
}
