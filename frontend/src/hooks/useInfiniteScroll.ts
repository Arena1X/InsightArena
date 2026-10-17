import { useEffect, useRef, useCallback, useState } from "react";

const THROTTLE_MS = 300;

interface UseInfiniteScrollOptions {
  onLoadMore: () => Promise<number | void>;
  enabled?: boolean;
  threshold?: number;
}

/**
 * Append a page of items without duplicating keys already present.
 * Used when infinite-scroll pages are merged into the visible list.
 */
export function appendUniqueByKey<T>(
  current: T[],
  incoming: T[],
  getKey: (item: T) => string,
): T[] {
  const seen = new Set(current.map(getKey));
  const appended: T[] = [];

  for (const item of incoming) {
    const key = getKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    appended.push(item);
  }

  return appended.length === 0 ? current : [...current, ...appended];
}

interface UseInfiniteScrollReturn {
  observerTarget: React.RefObject<HTMLDivElement | null>;
  isLoading: boolean;
  hasMore: boolean;
  setHasMore: (hasMore: boolean) => void;
  loadMore: () => void;
  lastLoadedCount: number;
  announcement: string;
  /** Reset the page tracking state (useful when filters/sorting changes) */
  reset: () => void;
}

export function useInfiniteScroll({
  onLoadMore,
  enabled = true,
  threshold = 0.1,
}: UseInfiniteScrollOptions): UseInfiniteScrollReturn {
  const observerTarget = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [lastLoadedCount, setLastLoadedCount] = useState(0);
  const [announcement, setAnnouncement] = useState("");
  const isLoadingRef = useRef(false);
  const lastLoadTimeRef = useRef(0);
  const currentPageRef = useRef(0);
  const loadedPagesRef = useRef(new Set<number>());

  const handleLoadMore = useCallback(async () => {
    if (!enabled || isLoadingRef.current || !hasMore) return;

    const now = Date.now();
    if (now - lastLoadTimeRef.current < THROTTLE_MS) return;

    // Duplicate page guard: check if the next page was already loaded
    const nextPage = currentPageRef.current + 1;
    if (loadedPagesRef.current.has(nextPage)) {
      console.warn(
        `[useInfiniteScroll] Page ${nextPage} already loaded, skipping duplicate request`,
      );
      return;
    }

    isLoadingRef.current = true;
    setIsLoading(true);

    try {
      const count = await onLoadMore();
      lastLoadTimeRef.current = Date.now();
      const loaded = typeof count === "number" ? count : 0;
      setLastLoadedCount(loaded);

      // Mark this page as loaded only after successful fetch
      if (loaded >= 0) {
        currentPageRef.current = nextPage;
        loadedPagesRef.current.add(nextPage);
      }

      if (loaded > 0) {
        setAnnouncement(`Loaded ${loaded} more item${loaded !== 1 ? "s" : ""}`);
      }
    } catch (error) {
      console.error("Error loading more items:", error);
      // On error, don't mark page as loaded so it can be retried
    } finally {
      isLoadingRef.current = false;
      setIsLoading(false);
    }
  }, [enabled, hasMore, onLoadMore]);

  const loadMore = useCallback(() => {
    handleLoadMore();
  }, [handleLoadMore]);

  const reset = useCallback(() => {
    currentPageRef.current = 0;
    loadedPagesRef.current.clear();
    setLastLoadedCount(0);
    setAnnouncement("");
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasMore && !isLoadingRef.current) {
          handleLoadMore();
        }
      },
      { threshold },
    );

    const target = observerTarget.current;
    if (target) {
      observer.observe(target);
    }

    return () => {
      if (target) {
        observer.unobserve(target);
      }
      observer.disconnect();
    };
  }, [enabled, hasMore, handleLoadMore, threshold]);

  return {
    observerTarget,
    isLoading,
    hasMore,
    setHasMore,
    loadMore,
    lastLoadedCount,
    announcement,
    reset,
  };
}
