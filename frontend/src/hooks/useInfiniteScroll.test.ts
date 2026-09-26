import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { appendUniqueByKey, useInfiniteScroll } from "./useInfiniteScroll";

// jsdom has no IntersectionObserver — provide a no-op mock
beforeEach(() => {
  const mockObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  }));
  vi.stubGlobal("IntersectionObserver", mockObserver);
});

type Entry = { username: string; rank: number };

describe("appendUniqueByKey", () => {
  it("appends additional pages without duplicating entries", () => {
    const pageOne: Entry[] = [
      { username: "0xArena_Pro", rank: 1 },
      { username: "CryptoSage", rank: 2 },
    ];
    const pageTwo: Entry[] = [
      { username: "CryptoSage", rank: 2 },
      { username: "PredictKing", rank: 3 },
      { username: "StarPredictor", rank: 4 },
    ];

    const merged = appendUniqueByKey(pageOne, pageTwo, (entry) =>
      entry.username.toLowerCase(),
    );

    expect(merged.map((entry) => entry.username)).toEqual([
      "0xArena_Pro",
      "CryptoSage",
      "PredictKing",
      "StarPredictor",
    ]);
    expect(new Set(merged.map((entry) => entry.username)).size).toBe(
      merged.length,
    );
  });

  it("returns the current list when the next page is fully duplicated", () => {
    const current: Entry[] = [{ username: "Alex", rank: 6 }];
    const next = appendUniqueByKey(current, current, (entry) =>
      entry.username.toLowerCase(),
    );

    expect(next).toBe(current);
  });
});

describe("useInfiniteScroll", () => {
  it("exposes a loadMore function that triggers onLoadMore", async () => {
    const onLoadMore = vi.fn().mockResolvedValue(5);

    const { result } = renderHook(() =>
      useInfiniteScroll({ onLoadMore, enabled: true }),
    );

    await act(async () => {
      result.current.loadMore();
    });

    expect(onLoadMore).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(result.current.lastLoadedCount).toBe(5);
      expect(result.current.announcement).toBe("Loaded 5 more items");
    });
  });

  it("prevents overlapping concurrent fetches", async () => {
    let resolveLoad: () => void;
    const onLoadMore = vi.fn().mockImplementation(
      () => new Promise<void>((resolve) => { resolveLoad = resolve; }),
    );

    const { result } = renderHook(() =>
      useInfiniteScroll({ onLoadMore, enabled: true }),
    );

    act(() => {
      result.current.loadMore();
    });

    expect(result.current.isLoading).toBe(true);

    act(() => {
      result.current.loadMore();
      result.current.loadMore();
    });

    expect(onLoadMore).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveLoad!();
    });

    expect(result.current.isLoading).toBe(false);
  });

  it("throttles rapid successive calls", async () => {
    const onLoadMore = vi.fn().mockResolvedValue(3);

    const { result } = renderHook(() =>
      useInfiniteScroll({ onLoadMore, enabled: true }),
    );

    await act(async () => {
      result.current.loadMore();
    });

    expect(onLoadMore).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.loadMore();
    });

    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it("does not fetch when disabled", async () => {
    const onLoadMore = vi.fn().mockResolvedValue(0);

    const { result } = renderHook(() =>
      useInfiniteScroll({ onLoadMore, enabled: false }),
    );

    await act(async () => {
      result.current.loadMore();
    });

    expect(onLoadMore).not.toHaveBeenCalled();
  });

  it("does not fetch when hasMore is false", async () => {
    const onLoadMore = vi.fn().mockResolvedValue(0);

    const { result } = renderHook(() =>
      useInfiniteScroll({ onLoadMore, enabled: true }),
    );

    act(() => {
      result.current.setHasMore(false);
    });

    await act(async () => {
      result.current.loadMore();
    });

    expect(onLoadMore).not.toHaveBeenCalled();
  });

  it("sets announcement for singular count", async () => {
    const onLoadMore = vi.fn().mockResolvedValue(1);

    const { result } = renderHook(() =>
      useInfiniteScroll({ onLoadMore, enabled: true }),
    );

    await act(async () => {
      result.current.loadMore();
    });

    await waitFor(() => {
      expect(result.current.announcement).toBe("Loaded 1 more item");
    });
  });
});
