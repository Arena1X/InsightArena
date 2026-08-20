import { useEffect, useRef, useCallback, useState } from "react";

interface UseInfiniteScrollOptions {
    onLoadMore: () => Promise<number | void>;
    enabled?: boolean;
    threshold?: number;
    /** Debounce window (ms) applied to observer-triggered fetches. */
    debounceMs?: number;
}

interface UseInfiniteScrollReturn {
    observerTarget: React.RefObject<HTMLDivElement | null>;
    /** Focusable "Load more" button fallback for keyboard / screen-reader users. */
    loadMoreButtonRef: React.RefObject<HTMLButtonElement | null>;
    /** ARIA live region announcing newly loaded item counts. */
    announcementRef: React.RefObject<HTMLDivElement | null>;
    /** Whether a "Load more" action is currently available. */
    canLoadMore: boolean;
    isLoading: boolean;
    hasMore: boolean;
    setHasMore: (hasMore: boolean) => void;
    /** Manually trigger a page load (used by the visible button or keyboard). */
    loadMore: () => void;
    /** Text to render inside the ARIA live region. */
    announcement: string;
    clearAnnouncement: () => void;
}

export function useInfiniteScroll({
    onLoadMore,
    enabled = true,
    threshold = 0.1,
    debounceMs = 200,
}: UseInfiniteScrollOptions): UseInfiniteScrollReturn {
    const observerTarget = useRef<HTMLDivElement>(null);
    const loadMoreButtonRef = useRef<HTMLButtonElement>(null);
    const announcementRef = useRef<HTMLDivElement>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [announcement, setAnnouncement] = useState("");
    const isLoadingRef = useRef(false);
    const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const handleLoadMore = useCallback(async () => {
        if (!enabled || isLoadingRef.current || !hasMore) return;

        isLoadingRef.current = true;
        setIsLoading(true);

        try {
            const loadedCount = await onLoadMore();
            if (typeof loadedCount === "number" && loadedCount > 0) {
                setAnnouncement(`Loaded ${loadedCount} more item${loadedCount === 1 ? "" : "s"}`);
            } else if (typeof loadedCount === "number" && loadedCount === 0) {
                setAnnouncement("No more items");
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

    const clearAnnouncement = useCallback(() => {
        setAnnouncement("");
    }, []);

    // Debounced observer trigger to avoid hammering the API on fast scroll.
    const scheduleObserverTrigger = useCallback(
        (trigger: () => void) => {
            if (debounceTimerRef.current !== null) {
                clearTimeout(debounceTimerRef.current);
            }
            debounceTimerRef.current = setTimeout(() => {
                debounceTimerRef.current = null;
                trigger();
            }, debounceMs);
        },
        [debounceMs],
    );

    useEffect(() => {
        if (!enabled) return;

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting && hasMore && !isLoadingRef.current) {
                    scheduleObserverTrigger(() => {
                        handleLoadMore();
                    });
                }
            },
            { threshold },
        );

        const target = observerTarget.current;
        if (target) {
            observer.observe(target);
        }

        return () => {
            if (debounceTimerRef.current !== null) {
                clearTimeout(debounceTimerRef.current);
                debounceTimerRef.current = null;
            }
            if (target) {
                observer.unobserve(target);
            }
            observer.disconnect();
        };
    }, [enabled, hasMore, handleLoadMore, threshold, scheduleObserverTrigger]);

    return {
        observerTarget,
        loadMoreButtonRef,
        announcementRef,
        canLoadMore: enabled && hasMore && !isLoading,
        isLoading,
        hasMore,
        setHasMore,
        loadMore,
        announcement,
        clearAnnouncement,
    };
}