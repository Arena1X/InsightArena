'use client';

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Header from "@/component/Header";
import Footer from "@/component/Footer";
import PageBackground from "@/component/PageBackground";
import MarketCard from "@/component/MarketCard";
import { useWallet } from "@/context/WalletContext";
import { useDebounce } from "@/hooks/useDebounce";
import { useInfiniteScroll } from "@/hooks/useInfiniteScroll";

// Assuming a Market type exists, adjust according to your actual types
interface Market {
  id: string;
  name: string;
  // ...other properties
}

export default function MarketsPage() {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState(searchParams.get("q") || "");
  const [category, setCategory] = useState(
    searchParams.get("category") || "All",
  );
  const [status, setStatus] = useState("All");
  const [sort, setSort] = useState("newest");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Preserve scroll position on back navigation
  const scrollKeyRef = useRef<string>("markets-scroll");
  const fetchGenRef = useRef(0);

  const loadMarkets = useCallback(() => {
    const controller = new AbortController();
    const gen = ++fetchGenRef.current;

    setLoading(true);
    setError(null);

    const base = process.env.NEXT_PUBLIC_API_URL || "";

    fetch(`${base}/api/v1/markets`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`Server error: ${res.status}`);
        return res.json() as Promise<Market[]>;
      })
      .then((data) => {
        if (gen !== fetchGenRef.current) return; // stale — discard
        setMarkets(data || []);
      })
      .catch((err: unknown) => {
        // AbortError is expected on cleanup — swallow silently
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (gen !== fetchGenRef.current) return; // stale — discard
        // Fallback mock data so the page is still usable during development /
        // when the API is unreachable, but surface the error for production.
        setMarkets([
          {
            id: "1",
            title: "Will BTC be above $70k on 2026-12-31?",
            category: "Crypto",
            probability: 0.42,
            totalStaked: 124.5,
            closeAt: new Date(
              Date.now() + 1000 * 60 * 60 * 24 * 10,
            ).toISOString(),
            status: "active",
          },
          {
            id: "2",
            title: "Team A to beat Team B in the Finals",
            category: "Sports",
            probability: 0.66,
            totalStaked: 52.1,
            closeAt: new Date(
              Date.now() + 1000 * 60 * 60 * 24 * 3,
            ).toISOString(),
            status: "active",
          },
          {
            id: "3",
            title: "Will inflation drop below 3% in 2026?",
            category: "Economics",
            probability: 0.28,
            totalStaked: 18.0,
            closeAt: new Date(
              Date.now() + 1000 * 60 * 60 * 24 * 60,
            ).toISOString(),
            status: "upcoming",
          },
        ]);
        setError(err instanceof Error ? err.message : "Failed to load markets");
      })
      .finally(() => {
        if (gen !== fetchGenRef.current) return; // stale — discard
        setLoading(false);
      });

    return controller;
  }, []);

  const debouncedSearch = useDebounce(search, 300);
  const initialUrlSynced = useRef(false);

  const syncUrl = useCallback(
    (debouncedVal: string, cat: string) => {
      const params = new URLSearchParams();
      if (debouncedVal.trim()) params.set("q", debouncedVal.trim());
      if (cat !== "All") params.set("category", cat);
      const qs = params.toString();
      const currentQs = window.location.search;
      const currentRaw = currentQs.startsWith("?")
        ? currentQs.slice(1)
        : currentQs;
      if (qs !== currentRaw) {
        router.replace(qs ? `?${qs}` : window.location.pathname, {
          scroll: false,
        });
      }
    },
    [router],
  );

  useEffect(() => {
    const q = searchParams.get("q") || "";
    const cat = searchParams.get("category") || "All";
    setSearch(q);
    setCategory(cat);
    initialUrlSynced.current = true;
  }, [searchParams]);

  useEffect(() => {
    const abortController = new AbortController();

    const fetchMarkets = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await apiClient.get<Market[]>('/markets', {
          signal: abortController.signal,
        });
        setMarkets(data);
      } catch (err) {
        if (err instanceof ApiError) {
          // Ignore abort errors silently
          if (err.kind !== 'network' || err.message !== 'Network error: The user aborted a request.') {
             setError(err.message);
          }
        } else if (err instanceof Error && err.name === 'AbortError') {
          // Native fetch AbortError fallback
          // Ignore
        } else {
          setError('An unexpected error occurred');
        }
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
  }, [loadMarkets]);

  const categories = useMemo(() => {
    const set = new Set(markets.map((m) => m.category));
    return ["All", ...Array.from(set)];
  }, [markets]);

  const filtered = useMemo(() => {
    let list = markets.slice();
    if (debouncedSearch.trim()) {
      const s = debouncedSearch.toLowerCase();
      list = list.filter((m) => m.title.toLowerCase().includes(s));
    }
    if (category !== "All") list = list.filter((m) => m.category === category);
    if (status !== "All")
      list = list.filter((m) => m.status === status.toLowerCase());

    if (sort === "newest")
      list.sort((a, b) => +new Date(b.closeAt) - +new Date(a.closeAt));
    if (sort === "popular") list.sort((a, b) => b.totalStaked - a.totalStaked);
    if (sort === "closing")
      list.sort((a, b) => +new Date(a.closeAt) - +new Date(b.closeAt));

    return list;
  }, [markets, debouncedSearch, category, status, sort]);

  const paged = filtered.slice(0, page * PAGE_SIZE);
  const hasMore = paged.length < filtered.length;

  const loadMore = useCallback(() => {
    if (!loading && hasMore) setPage((p) => p + 1);
  }, [loading, hasMore]);

  // Restore scroll position on back navigation
  useEffect(() => {
    const saved = sessionStorage.getItem(scrollKeyRef.current);
    if (saved) window.scrollTo(0, parseInt(saved, 10));
    const onScroll = () =>
      sessionStorage.setItem(scrollKeyRef.current, String(window.scrollY));
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const sentinelRef = useInfiniteScroll({
    onLoadMore: loadMore,
    hasMore,
    loading,
  });

  const { isAuthenticated, openConnectModal } = useWallet();

  function handlePredict(market: Market) {
    if (!isAuthenticated) {
      openConnectModal();
      return;
    }
    // navigate to market detail / prediction flow
    window.location.href = `/markets/${market.id}`;
  }

  function clearFilters() {
    setSearch("");
    setCategory("All");
    setStatus("All");
    setSort("newest");
    setPage(1);
  }

  const hasActiveFilters =
    search.trim() !== "" ||
    category !== "All" ||
    status !== "All" ||
    sort !== "newest";

  return (
    <PageBackground>
      <Header />

      <main className="min-h-screen px-6 py-12">
        <div className="mx-auto max-w-6xl">
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white">Markets</h1>
              <p className="mt-1 text-sm text-gray-400">
                Browse live prediction markets and compete.
              </p>
            </div>

            <div className="flex w-full max-w-lg items-center gap-2">
              <input
                aria-label="Search markets"
                placeholder="Search markets..."
                className="w-full rounded-md border border-white/10 bg-white/2 px-3 py-2 text-sm text-white placeholder:text-gray-500"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="mb-6 flex w-full flex-wrap items-center gap-3">
            <select
              className="rounded-md border border-white/10 bg-white/2 px-3 py-2 text-sm text-white"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {categories.map((c) => (
                <option key={c} value={c} className="text-black">
                  {c}
                </option>
              ))}
            </select>

            <select
              className="rounded-md border border-white/10 bg-white/2 px-3 py-2 text-sm text-white"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option>All</option>
              <option>Active</option>
              <option>Resolved</option>
              <option>Upcoming</option>
            </select>

            <select
              className="rounded-md border border-white/10 bg-white/2 px-3 py-2 text-sm text-white"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="newest">Newest</option>
              <option value="popular">Most Popular</option>
              <option value="closing">Closing Soon</option>
            </select>

            <div className="ml-auto text-sm text-gray-400">
              {filtered.length} results
            </div>
          </div>

          {error && (
            <div
              role="alert"
              className="mb-4 flex items-center justify-between rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400"
            >
              <span>{error}</span>
              <button
                onClick={() => loadMarkets()}
                className="ml-4 rounded bg-red-500/20 px-3 py-1 text-xs font-semibold text-red-300 hover:bg-red-500/30 transition-colors"
              >
                Retry
              </button>
            </div>
          )}

          {loading && paged.length === 0 && (
            <div className="py-12 text-center text-gray-400">
              Loading markets...
            </div>
          )}

          {!loading && paged.length === 0 && (
            <div className="rounded-md border border-white/6 bg-white/3 p-8 text-center text-gray-300">
              {hasActiveFilters ? (
                <>
                  <p className="mb-3">No markets match your filters.</p>
                  <button
                    className="rounded-md bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/20"
                    onClick={clearFilters}
                  >
                    Clear filters
                  </button>
                </>
              ) : (
                "No markets found."
              )}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {paged.map((m) => (
              <MarketCard
                key={m.id}
                market={m}
                onPredict={() => handlePredict(m)}
              />
            ))}
          </div>

          {/* Infinite scroll sentinel */}
          <div ref={sentinelRef} aria-hidden="true" />

          {/* Loading next page */}
          {loading && paged.length > 0 && (
            <div
              className="mt-6 flex justify-center py-4"
              aria-live="polite"
              aria-label="Loading more markets"
            >
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-orange-400" />
            </div>
          )}

          {/* End of list */}
          {!hasMore && paged.length > 0 && (
            <p className="mt-6 text-center text-xs text-gray-600">
              All {filtered.length} markets loaded
            </p>
          )}
        </div>
      </main>

  if (loading) return <div>Loading markets...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div>
      <h1>Markets</h1>
      <ul>
        {markets.map((market) => (
          <li key={market.id}>{market.name}</li>
        ))}
      </ul>
    </div>
  );
}