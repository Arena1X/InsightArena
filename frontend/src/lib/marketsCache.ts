export interface CachedMarket {
  name: string;
  price: string;
  volume: string;
  change: string;
  isFavorite: boolean;
}

const MARKETS_CACHE_KEY = "insightarena.cached_markets";

/**
 * Persist the last-viewed markets list so it can be served while offline.
 * Best-effort: a full/blocked localStorage should not break the caller.
 */
export function cacheMarkets(markets: CachedMarket[]): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(MARKETS_CACHE_KEY, JSON.stringify(markets));
  } catch {
    // Best-effort only.
  }
}

/**
 * Read back the last cached markets list. Returns an empty array (not
 * `null`) when nothing has been cached yet or storage is unavailable, so
 * callers can render it directly without a null check.
 */
export function getCachedMarkets(): CachedMarket[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(MARKETS_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
