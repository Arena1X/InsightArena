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

    const handleLoadMore = useCallback(async () => {
        if (!enabled || isLoadingRef.current || !hasMore) return;

        const now = Date.now();
        if (now - lastLoadTimeRef.current < THROTTLE_MS) return;

        isLoadingRef.current = true;
        setIsLoading(true);

        try {
            const count = await onLoadMore();
            lastLoadTimeRef.current = Date.now();
            const loaded = typeof count === "number" ? count : 0;
            setLastLoadedCount(loaded);
            if (loaded > 0) {
                setAnnouncement(`Loaded ${loaded} more item${loaded !== 1 ? "s" : ""}`);
            }
        } catch (error) {
            console.error("Error loading more items:", error);
        } finally {
            isLoadingRef.current = false;
            setIsLoading(false);
        }
    }, [enabled, hasMore, onLoadMore]);

    const loadMore = useCallback(() => {
        handleLoadMore();
    }, [handleLoadMore]);

    useEffect(() => {
        if (!enabled) return;

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting && hasMore && !isLoadingRef.current) {
                    handleLoadMore();
                }
            },
            { threshold }
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
    };
}
