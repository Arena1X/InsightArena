import { useEffect, useRef, useCallback, useState } from "react";

interface UseInfiniteScrollOptions {
    onLoadMore: () => Promise<void>;
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
}

export function useInfiniteScroll({
    onLoadMore,
    enabled = true,
    threshold = 0.1,
}: UseInfiniteScrollOptions): UseInfiniteScrollReturn {
    const observerTarget = useRef<HTMLDivElement>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const isLoadingRef = useRef(false);

    const handleLoadMore = useCallback(async () => {
        if (!enabled || isLoadingRef.current || !hasMore) return;

        isLoadingRef.current = true;
        setIsLoading(true);

        try {
            await onLoadMore();
        } catch (error) {
            console.error("Error loading more items:", error);
        } finally {
            isLoadingRef.current = false;
            setIsLoading(false);
        }
    }, [enabled, hasMore, onLoadMore]);

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
    };
}
