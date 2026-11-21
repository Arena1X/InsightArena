"use client";

import { useEffect, useState, useMemo } from "react";
import { apiClient } from "@/lib/api";
import { useFavorites } from "@/context/FavoritesContext";
import { useLiveOddsWithAlerts } from "@/hooks/useLiveOddsWithAlerts";
import MarketCard from "@/component/MarketCard";
import PriceAlertManager from "@/component/PriceAlertManager";
import { EmptyState } from "@/component/ui/empty-state";
import { Skeleton } from "@/component/ui/skeleton";
import { Heart, Bell } from "lucide-react";

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
  const [selectedMarket, setSelectedMarket] = useState<Market | null>(null);

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

  const handleManageAlerts = (market: Market) => {
    setSelectedMarket(market);
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

      {selectedMarket && (
        <div className="mb-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Bell size={20} />
              Manage Alerts - {selectedMarket.title}
            </h2>
            <button
              onClick={() => setSelectedMarket(null)}
              className="text-sm text-gray-400 hover:text-white"
            >
              Close
            </button>
          </div>
          <PriceAlertManager
            marketId={selectedMarket.id}
            marketTitle={selectedMarket.title}
          />
        </div>
      )}

      {watchlistMarkets.length > 0 ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {watchlistMarkets.map((market) => (
            <div key={market.id} className="space-y-3">
              <WatchlistMarketCard
                market={market}
                isFavorite={favoriteIds.has(market.id)}
                onFavoriteToggle={() => handleFavoriteToggle(market.id)}
                onPredict={() => handlePredict(market.id)}
              />
              <button
                onClick={() => handleManageAlerts(market)}
                className="w-full flex items-center justify-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-gray-300 hover:bg-white/10 hover:text-white transition-colors"
              >
                <Bell size={16} />
                Manage Price Alerts
              </button>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Heart size={32} />}
          title="Your Watchlist is Empty"
          description="Add markets to your watchlist to keep track of them. Click the heart icon on any market to save it here."
          action={{ label: "Browse Markets", href: "/markets" }}
          variant="empty"
        />
      )}
    </div>
  );
}

// Component that monitors a single market's live odds with alerts
function WatchlistMarketCard({
  market,
  isFavorite,
  onFavoriteToggle,
  onPredict,
}: {
  market: Market;
  isFavorite: boolean;
  onFavoriteToggle: () => void;
  onPredict: () => void;
}) {
  // This hook will automatically check price alerts when odds update
  useLiveOddsWithAlerts(market.id);

  return (
    <MarketCard
      market={market}
      isFavorite={isFavorite}
      onFavoriteToggle={onFavoriteToggle}
      onPredict={onPredict}
    />
  );
}
