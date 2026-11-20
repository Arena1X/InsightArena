export interface CachedMarket {
  name: string;
  price: string;
  volume: string;
  change: string;
  isFavorite: boolean;
}

const MARKETS_CACHE_KEY = "insightarena.cached_markets";
const FRESH_MARKETS_CACHE_MS = 30_000;
/** Cached markets may be shown stale for at most five minutes while refreshing. */
const MAX_MARKETS_STALE_MS = 5 * 60_000;

type MarketsRevalidator = () => Promise<CachedMarket[]>;

interface MarketsCacheEntry {
  markets: CachedMarket[];
  cachedAt: number;
}

let marketsRevalidator: MarketsRevalidator | null = null;
let revalidation: Promise<void> | null = null;
const cacheListeners = new Set<(markets: CachedMarket[]) => void>();

function readCacheEntry(): MarketsCacheEntry | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(MARKETS_CACHE_KEY);
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      // Migrate entries written by the previous format on first access.
      const migrated = { markets: parsed as CachedMarket[], cachedAt: Date.now() };
      try {
        window.localStorage.setItem(MARKETS_CACHE_KEY, JSON.stringify(migrated));
      } catch {
        // A read-only cache can still be served for this access.
      }
      return migrated;
    }
    if (
      parsed &&
      typeof parsed === "object" &&
      "markets" in parsed &&
      Array.isArray(parsed.markets) &&
      "cachedAt" in parsed &&
      typeof parsed.cachedAt === "number"
    ) {
      return { markets: parsed.markets as CachedMarket[], cachedAt: parsed.cachedAt };
    }
  } catch {
    // Treat unavailable storage and malformed entries as an empty cache.
  }

  return null;
}

function notifyCacheListeners(markets: CachedMarket[]): void {
  for (const listener of cacheListeners) listener(markets);
}

function startRevalidation(): void {
  if (!marketsRevalidator || revalidation) return;

  revalidation = Promise.resolve()
    .then(() => marketsRevalidator?.())
    .then((markets) => {
      if (markets) cacheMarkets(markets);
    })
    .catch(() => {
      // Keep serving the last cached value if the refresh fails.
    })
    .finally(() => {
      revalidation = null;
    });
}

/** Register the data source used for background refreshes. */
export function setMarketsRevalidator(
  revalidator: MarketsRevalidator | null,
): () => void {
  marketsRevalidator = revalidator;
  return () => {
    if (marketsRevalidator === revalidator) marketsRevalidator = null;
  };
}

/** Subscribe to updates written by a successful background refresh. */
export function subscribeToMarketsCache(
  listener: (markets: CachedMarket[]) => void,
): () => void {
  cacheListeners.add(listener);
  return () => cacheListeners.delete(listener);
}

/**
 * Persist the last-viewed markets list so it can be served while offline.
 * Best-effort: a full/blocked localStorage should not break the caller.
 */
export function cacheMarkets(markets: CachedMarket[]): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      MARKETS_CACHE_KEY,
      JSON.stringify({ markets, cachedAt: Date.now() } satisfies MarketsCacheEntry),
    );
  } catch {
    // Best-effort only.
  }
  notifyCacheListeners(markets);
}

/**
 * Read back the last cached markets list. Returns an empty array (not
 * `null`) when nothing has been cached yet or storage is unavailable, so
 * callers can render it directly without a null check.
 */
export function getCachedMarkets(): CachedMarket[] {
  const entry = readCacheEntry();
  if (!entry) {
    startRevalidation();
    return [];
  }

  const age = Math.max(0, Date.now() - entry.cachedAt);
  if (age > MAX_MARKETS_STALE_MS) {
    startRevalidation();
    return [];
  }
  if (age > FRESH_MARKETS_CACHE_MS) startRevalidation();

  return entry.markets;
}
