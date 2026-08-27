import React from "react";
import { Heart } from "lucide-react";
import Link from "next/link";

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
}: {
  market: Market;
  onPredict: () => void;
  isFavorite?: boolean;
  onFavoriteToggle?: () => void;
}) {
  const probabilityPct = Math.round((market.probability || 0) * 100);

  function timeRemaining(closeAt: string) {
    const diff = new Date(closeAt).getTime() - Date.now();
    if (diff <= 0) return "Closed";
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
    if (days > 0) return `${days}d ${hours}h`;
    const mins = Math.floor((diff / (1000 * 60)) % 60);
    return `${hours}h ${mins}m`;
  }

  function statusColor(status: string) {
    if (status === "active")
      return "bg-green-500/20 text-green-300 border-green-700/40";
    if (status === "upcoming")
      return "bg-yellow-500/10 text-yellow-300 border-yellow-700/30";
    return "bg-white/5 text-gray-300 border-white/6";
  }

  return (
    <Link href={`/markets/${market.id}`} className="block min-h-[220px] rounded-xl border border-white/6 bg-white/3 p-4 hover:border-white/20 transition-colors">
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
              className={`ml-auto inline-flex items-center gap-2 rounded-full border px-2 py-0.5 text-xs ${statusColor(market.status)}`}
            >
              {market.status.toUpperCase()}
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
              <div className="text-right text-sm text-gray-400">
                <div>{market.totalStaked.toFixed(2)} XLM</div>
                <div className="mt-1 text-xs">
                  {timeRemaining(market.closeAt)}
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
          className="ml-auto rounded-md bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600"
        >
          Predict
        </button>
      </div>
    </Link>
  );
}
