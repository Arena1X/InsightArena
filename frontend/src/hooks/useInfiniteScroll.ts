"use client";

import { useCallback, useEffect, useRef } from "react";

interface UseInfiniteScrollOptions {
    /** Called when the sentinel element enters the viewport */
    onLoadMore: () => void;
    /** Stop observing when true (no more pages to load) */
    hasMore: boolean;
    /** Whether a fetch is currently in progress */
    loading: boolean;
    /** IntersectionObserver rootMargin — default "0px 0px 200px 0px" pre-loads slightly early */
    rootMargin?: string;
}

/**
 * Returns a ref to attach to the sentinel element at the bottom of the list.
 * When the sentinel enters the viewport (and there is more data and no fetch
 * in progress), `onLoadMore` is called.
 */
export function useInfiniteScroll({
    onLoadMore,
    hasMore,
    loading,
    rootMargin = "0px 0px 200px 0px",
}: UseInfiniteScrollOptions) {
    const sentinelRef = useRef<HTMLDivElement | null>(null);

    const handleIntersect = useCallback(
        (entries: IntersectionObserverEntry[]) => {
            const [entry] = entries;
            if (entry.isIntersecting && hasMore && !loading) {
                onLoadMore();
            }
        },
        [onLoadMore, hasMore, loading],
    );

    useEffect(() => {
        const el = sentinelRef.current;
        if (!el) return;

        const observer = new IntersectionObserver(handleIntersect, {
            rootMargin,
            threshold: 0,
        });

        observer.observe(el);

        return () => {
            observer.unobserve(el);
            observer.disconnect();
        };
    }, [handleIntersect, rootMargin]);

    return sentinelRef;
}
