"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { apiClient, ApiError } from "@/lib/api";
import { useFavorites } from "@/context/FavoritesContext";
import { usePredictionSlip } from "@/context/PredictionSlipContext";
import { useInfiniteScroll } from "@/hooks/useInfiniteScroll";
import { useDebounce } from "@/hooks/useDebounce";
import MarketCard from "@/component/MarketCard";
import { MarketsPageLoadingSkeleton } from "@/component/loading-route-skeletons";
import { EmptyState } from "@/component/ui/empty-state";
import { Heart, AlertCircle, Inbox, Loader2, Search, X } from "lucide-react";

interface Market {
  id: string;
  title: string;
  category: string;
  probability: number;
  totalStaked: number;
  closeAt: string;
  status: string;
}

const CATEGORIES = ["All", "Sports", "Finance", "Crypto", "Politics", "Tech"];
const PAGE_SIZE = 12;
const SCROLL_POSITION_KEY = "markets_scroll_position";

export default function MarketsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    favoriteIds,
    toggleFavorite,
    isLoading: favoritesLoading,
  } = useFavorites();
  const { addItem, openSlip } = usePredictionSlip();

  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMoreState] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>(
    searchParams.get("category") || "All",
  );
  const [searchQuery, setSearchQuery] = useState<string>(
    searchParams.get("q") || "",
  );
  const debouncedSearch = useDebounce(searchQuery, 300);
  const [viewMode, setViewMode] = useState<"all" | "favorites">(
    searchParams.get("view") === "favorites" ? "favorites" : "all",
  );
  // Save scroll position before navigating away
  useEffect(() => {
    const saveScrollPosition = () => {
      sessionStorage.setItem(SCROLL_POSITION_KEY, String(window.scrollY));
    };
    window.addEventListener("beforeunload", saveScrollPosition);
    return () => {
      saveScrollPosition();
      window.removeEventListener("beforeunload", saveScrollPosition);
    };
  }, []);

  // Fetch markets (initial + paginated)
  const fetchMarketsPage = useCallback(async (pageNum: number) => {
    try {
      const data = await apiClient.get<Market[]>(
        `/markets?page=${pageNum}&limit=${PAGE_SIZE}`,
      );
      const newMarkets = data || [];

      if (pageNum === 0) {
        setMarkets(newMarkets);
      } else {
        setMarkets((prev) => {
          const ids = new Set(prev.map((m) => m.id));
          const filtered = newMarkets.filter((m) => !ids.has(m.id));
          return [...prev, ...filtered];
        });
      }

      setHasMoreState(newMarkets.length === PAGE_SIZE);
      setError(null);
    } catch (err) {
      const errorMessage =
        err instanceof ApiError ? err.message : "An unexpected error occurred";
      setError(errorMessage);
      setHasMoreState(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    setLoading(true);
    setPage(0);
    setMarkets([]);
    setHasMoreState(true);

    const fetchInitial = async () => {
      await fetchMarketsPage(0);
      setLoading(false);
    };

    fetchInitial();
  }, [fetchMarketsPage]);

  // Restore scroll position after markets are loaded (e.g. returning via back navigation)
  useEffect(() => {
    if (loading || markets.length === 0) return;
    const saved = sessionStorage.getItem(SCROLL_POSITION_KEY);
    if (!saved) return;
    sessionStorage.removeItem(SCROLL_POSITION_KEY);
    requestAnimationFrame(() => {
      window.scrollTo({ top: Number(saved), behavior: "instant" as ScrollBehavior });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, markets.length > 0]);

  // Infinite scroll handler
  const handleLoadMore = useCallback(async () => {
    const nextPage = page + 1;
    setPage(nextPage);
    await fetchMarketsPage(nextPage);
  }, [page, fetchMarketsPage]);

  const { observerTarget, isLoading: isLoadingMore } = useInfiniteScroll({
    onLoadMore: handleLoadMore,
    enabled: viewMode === "all" && hasMore && !loading,
  });

  // Update URL when category, search, or view changes
  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    if (selectedCategory === "All") {
      params.delete("category");
    } else {
      params.set("category", selectedCategory);
    }
    if (debouncedSearch) {
      params.set("q", debouncedSearch);
    } else {
      params.delete("q");
    }
    if (viewMode === "favorites") {
      params.set("view", "favorites");
    } else {
      params.delete("view");
    }
    router.push(`?${params.toString()}`);
  }, [selectedCategory, debouncedSearch, viewMode, router, searchParams]);

  // Filter markets by category, search, and favorites
  const filteredMarkets = useMemo(() => {
    let filtered = markets;

    if (selectedCategory !== "All") {
      filtered = filtered.filter(
        (m) => m.category.toLowerCase() === selectedCategory.toLowerCase(),
      );
    }

    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      filtered = filtered.filter(
        (m) =>
          m.title.toLowerCase().includes(q) ||
          m.category.toLowerCase().includes(q),
      );
    }

    if (viewMode === "favorites") {
      filtered = filtered.filter((m) => favoriteIds.has(m.id));
    }

    return filtered;
  }, [markets, selectedCategory, debouncedSearch, viewMode, favoriteIds]);

  const handleCategoryChange = useCallback((category: string) => {
    setSelectedCategory(category);
  }, []);

  const handleViewModeChange = useCallback((mode: "all" | "favorites") => {
    setViewMode(mode);
  }, []);

  const handleFavoriteToggle = useCallback(
    (marketId: string) => {
      toggleFavorite(marketId);
    },
    [toggleFavorite],
  );

  const handlePredict = useCallback((marketId: string) => {
    const market = markets.find((m) => m.id === marketId);
    if (market) {
      addItem({
        marketId: market.id,
        marketTitle: market.title,
        category: market.category,
        outcome: "Yes",
        odds: market.probability > 0 ? 1 / market.probability : 2,
      });
      openSlip();
    }
  }, [markets, addItem, openSlip]);

  // Category counts
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    CATEGORIES.forEach((cat) => {
      if (cat === "All") {
        counts[cat] = markets.length;
      } else {
        counts[cat] = markets.filter(
          (m) => m.category.toLowerCase() === cat.toLowerCase(),
        ).length;
      }
    });
    return counts;
  }, [markets]);

  if (loading || favoritesLoading) return <MarketsPageLoadingSkeleton />;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 p-6 md:p-10">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white">Markets</h1>
          <p className="mt-2 text-gray-400">
            Browse and predict on various markets
          </p>
        </div>

        {/* Search Bar */}
        <div className="relative mb-6">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search markets by title or category…"
            className="w-full rounded-xl border border-white/10 bg-white/5 py-3 pl-11 pr-10 text-sm text-white outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20 placeholder:text-slate-500"
            aria-label="Search markets"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* View Mode Tabs */}
        <div className="mb-6 flex gap-2">
          <button
            onClick={() => handleViewModeChange("all")}
            className={`rounded-lg px-4 py-2 font-medium transition-colors ${
              viewMode === "all"
                ? "bg-primary text-primary-foreground"
                : "bg-white/10 text-gray-300 hover:bg-white/20"
            }`}
          >
            All Markets
          </button>
          <button
            onClick={() => handleViewModeChange("favorites")}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 font-medium transition-colors ${
              viewMode === "favorites"
                ? "bg-primary text-primary-foreground"
                : "bg-white/10 text-gray-300 hover:bg-white/20"
            }`}
          >
            <Heart size={16} />
            Watchlist{" "}
            {viewMode === "favorites" && `(${filteredMarkets.length})`}
          </button>
        </div>

        {/* Category Tabs */}
        {viewMode === "all" && (
          <div className="mb-6 overflow-x-auto pb-2">
            <div className="flex gap-2">
              {CATEGORIES.map((category) => (
                <button
                  key={category}
                  onClick={() => handleCategoryChange(category)}
                  className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-all ${
                    selectedCategory === category
                      ? "bg-orange-500 text-white"
                      : "bg-white/10 text-gray-300 hover:bg-white/20"
                  }`}
                  aria-pressed={selectedCategory === category}
                >
                  {category} ({categoryCounts[category] || 0})
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="mb-6 rounded-lg border border-red-500/50 bg-red-500/10 p-4">
            <div className="flex items-center gap-3 text-red-300">
              <AlertCircle size={20} />
              <div>
                <p className="font-semibold">Error loading markets</p>
                <p className="text-sm">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Markets Grid */}
        {filteredMarkets.length > 0 ? (
          <>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {filteredMarkets.map((market) => (
                <MarketCard
                  key={market.id}
                  market={market}
                  isFavorite={favoriteIds.has(market.id)}
                  onFavoriteToggle={() => handleFavoriteToggle(market.id)}
                  onPredict={() => handlePredict(market.id)}
                />
              ))}
            </div>

            {/* Infinite scroll trigger and loading state */}
            {viewMode === "all" && (
              <>
                <div
                  ref={observerTarget}
                  className="mt-12 flex justify-center"
                  aria-hidden="true"
                />

                {isLoadingMore && (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-[#4FD1C5]" />
                  </div>
                )}

                {!hasMore && markets.length > 0 && (
                  <div className="mt-8 text-center">
                    <p className="text-sm text-slate-400">
                      You've reached the end of the list
                    </p>
                  </div>
                )}
              </>
            )}
          </>
        ) : (
          <EmptyState
            icon={
              viewMode === "favorites" ? (
                <Heart size={32} />
              ) : (
                <Inbox size={32} />
              )
            }
            title={
              debouncedSearch
                ? "No Results Found"
                : viewMode === "favorites"
                  ? "No Favorite Markets Yet"
                  : selectedCategory === "All"
                    ? "No Markets Available"
                    : `No ${selectedCategory} Markets`
            }
            description={
              debouncedSearch
                ? `No markets match "${debouncedSearch}". Try a different search term.`
                : viewMode === "favorites"
                  ? "Start adding markets to your watchlist to see them here. Click the heart icon on any market to favorite it."
                  : `No markets found in this category. Try selecting a different category or check back soon.`
            }
            action={
              viewMode === "favorites"
                ? {
                    label: "Browse Markets",
                    onClick: () => handleViewModeChange("all"),
                  }
                : undefined
            }
            variant="empty"
          />
        )}
      </div>
    </div>
  );
}
