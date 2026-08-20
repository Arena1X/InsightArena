import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useInfiniteScroll } from "./useInfiniteScroll";

/**
 * jsdom has no IntersectionObserver — stub it out so the hook can mount.
 * We won't rely on the observer in these tests; we exercise the public
 * fallback API (loadMore button / loadMore()) which is the keyboard path.
 */
class MockIntersectionObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

beforeEach(() => {
  (globalThis as Record<string, unknown>).IntersectionObserver =
    MockIntersectionObserver;
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function makeDeferred() {
  let resolve!: (value: number) => void;
  const promise = new Promise<number>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe("useInfiniteScroll — accessibility fallback", () => {
  it("renders a focusable Load more button ref alongside the observer target", () => {
    const { result } = renderHook(() =>
      useInfiniteScroll({ onLoadMore: vi.fn().mockResolvedValue(5) }),
    );

    expect(result.current.observerTarget).toBeDefined();
    expect(result.current.loadMoreButtonRef).toBeDefined();
    expect(result.current.announcementRef).toBeDefined();
    expect(result.current.canLoadMore).toBe(true);
  });

  it("triggers onLoadMore when loadMore() is called (keyboard/button path)", async () => {
    const onLoadMore = vi.fn().mockResolvedValue(5);
    const { result } = renderHook(() => useInfiniteScroll({ onLoadMore }));

    await act(async () => {
      result.current.loadMore();
    });

    expect(onLoadMore).toHaveBeenCalledTimes(1);
    expect(result.current.isLoading).toBe(false);

    // The live region should announce the loaded count.
    expect(result.current.announcement).toBe("Loaded 5 more items");
    expect(result.current.announcementRef.current).toBeDefined();
  });

  it("does not fetch again while a request is still in flight (no overlap)", async () => {
    const { promise, resolve } = makeDeferred();
    const onLoadMore = vi.fn().mockReturnValue(promise);
    const { result } = renderHook(() => useInfiniteScroll({ onLoadMore }));

    let firstCall: Promise<void>;
    act(() => {
      firstCall = result.current.loadMore();
    });

    // A second "click"/observer trigger while loading must be ignored.
    act(() => {
      result.current.loadMore();
    });

    expect(onLoadMore).toHaveBeenCalledTimes(1);
    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      resolve(3);
      await firstCall!;
    });

    // After completion, a new load is allowed.
    act(() => {
      result.current.loadMore();
    });
    expect(onLoadMore).toHaveBeenCalledTimes(2);
  });

  it("does not load when disabled", async () => {
    const onLoadMore = vi.fn().mockResolvedValue(5);
    const { result } = renderHook(() =>
      useInfiniteScroll({ onLoadMore, enabled: false }),
    );

    act(() => {
      result.current.loadMore();
    });

    expect(onLoadMore).not.toHaveBeenCalled();
    expect(result.current.canLoadMore).toBe(false);
  });

  it("does not load when hasMore is false", async () => {
    const onLoadMore = vi.fn().mockResolvedValue(0);
    const { result } = renderHook(() => useInfiniteScroll({ onLoadMore }));

    act(() => {
      result.current.setHasMore(false);
    });
    act(() => {
      result.current.loadMore();
    });

    expect(onLoadMore).not.toHaveBeenCalled();
    expect(result.current.canLoadMore).toBe(false);
  });

  it("announces zero loads as a 'no more items' message", async () => {
    const onLoadMore = vi.fn().mockResolvedValue(0);
    const { result } = renderHook(() => useInfiniteScroll({ onLoadMore }));

    await act(async () => {
      result.current.loadMore();
    });

    expect(result.current.announcement).toBe("No more items");
  });

  it("clears the announcement on demand", async () => {
    const onLoadMore = vi.fn().mockResolvedValue(5);
    const { result } = renderHook(() => useInfiniteScroll({ onLoadMore }));

    await act(async () => {
      result.current.loadMore();
    });
    expect(result.current.announcement).toBe("Loaded 5 more items");

    act(() => {
      result.current.clearAnnouncement();
    });
    expect(result.current.announcement).toBe("");
  });

  it("handles onLoadMore rejection without leaving the hook stuck loading", async () => {
    const onLoadMore = vi.fn().mockRejectedValue(new Error("network down"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { result } = renderHook(() => useInfiniteScroll({ onLoadMore }));

    await act(async () => {
      result.current.loadMore();
    });

    expect(result.current.isLoading).toBe(false);
    // Can retry after a failure.
    act(() => {
      result.current.loadMore();
    });
    expect(onLoadMore).toHaveBeenCalledTimes(2);
    consoleSpy.mockRestore();
  });

  it("does not fetch again while hasMore has been set to false mid-flight", async () => {
    const { promise, resolve } = makeDeferred();
    const onLoadMore = vi.fn().mockReturnValue(promise);
    const { result } = renderHook(() => useInfiniteScroll({ onLoadMore }));

    let firstCall: Promise<void>;
    act(() => {
      firstCall = result.current.loadMore();
      // Simulate the data layer observing that the last page was returned.
      result.current.setHasMore(false);
    });
    act(() => {
      result.current.loadMore();
    });
    expect(onLoadMore).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolve(2);
      await firstCall!;
    });
    // hasMore false now: further calls are a no-op.
    act(() => {
      result.current.loadMore();
    });
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });
});