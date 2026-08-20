"use client";

import { useEffect, useState, useMemo } from "react";
import { apiClient } from "@/lib/api";
import { useFavorites } from "@/context/FavoritesContext";
import MarketCard from "@/component/MarketCardWithOdds";
import { EmptyState } from "@/component/ui/empty-state";
import { Skeleton } from "@/component/ui/skeleton";
import { Heart } from "lucide-react";

interface Market {
  id: string;
  title: string;
  category: string;
  probability: number;
  totalStaked: number;
  closeAt: string;
  status: string;
}

export default function WatchlistPage() {
  const {
    favoriteIds,
    toggleFavorite,
    isLoading: favoritesLoading,
  } = useFavorites();
  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch all markets
  useEffect(() => {
    const abortController = new AbortController();

    const fetchMarkets = async () => {
      setLoading(true);
      try {
        const data = await apiClient.get<Market[]>("/markets", {
          signal: abortController.signal,
        });
        setMarkets(data || []);
      } catch {
        // Ignore errors
      } finally {
        if (!abortController.signal.aborted) {
          setLoading(false);
        }
      }
    };

    fetchMarkets();

    return () => {
      abortController.abort();
    };
  }, []);

  // Filter to only favorited markets
  const watchlistMarkets = useMemo(() => {
    return markets.filter((m) => favoriteIds.has(m.id));
  }, [markets, favoriteIds]);

  const handleFavoriteToggle = (marketId: string) => {
    toggleFavorite(marketId);
  };

  const handlePredict = (marketId: string) => {
    console.log(`Predict clicked for market ${marketId}`);
  };

  if (loading || favoritesLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-white">My Watchlist</h1>
          <p className="mt-2 text-gray-400">Markets you are watching</p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, idx) => (
            <Skeleton key={idx} className="h-64 rounded-lg bg-white/10" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">My Watchlist</h1>
        <p className="mt-2 text-gray-400">
          {watchlistMarkets.length} market
          {watchlistMarkets.length !== 1 ? "s" : ""} saved
        </p>
      </div>

      {watchlistMarkets.length > 0 ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {watchlistMarkets.map((market) => (
            <MarketCard
              key={market.id}
              market={market}
              isFavorite={favoriteIds.has(market.id)}
              onFavoriteToggle={() => handleFavoriteToggle(market.id)}
              onPredict={() => handlePredict(market.id)}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Heart size={32} />}
          title="Your Watchlist is Empty"
          description="Add markets to your watchlist to keep track of them. Click the heart icon on any market to save it here."
          action={{
            label: "Browse Markets",
            onClick: () => (window.location.href = "/markets"),
          }}
          variant="empty"
        />
      )}
    </div>
  );
}
