import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cacheMarkets,
  getCachedMarkets,
  setMarketsRevalidator,
  subscribeToMarketsCache,
  type CachedMarket,
} from "./marketsCache";

const sample: CachedMarket[] = [
  { name: "Bitcoin", price: "$39422.76", volume: "2.1B", change: "+10.29%", isFavorite: false },
  { name: "Ethereum", price: "$2000.00", volume: "1.0B", change: "-1.77%", isFavorite: true },
];

describe("marketsCache", () => {
  afterEach(() => {
    window.localStorage.clear();
    setMarketsRevalidator(null);
    vi.useRealTimers();
  });

  it("returns an empty array when nothing has been cached", () => {
    expect(getCachedMarkets()).toEqual([]);
  });

  it("round-trips a cached markets list", () => {
    cacheMarkets(sample);
    expect(getCachedMarkets()).toEqual(sample);
  });

  it("overwrites the previous cache on a subsequent call", () => {
    cacheMarkets(sample);
    cacheMarkets([sample[0]]);
    expect(getCachedMarkets()).toEqual([sample[0]]);
  });

  it("falls back to an empty array for corrupted stored JSON", () => {
    window.localStorage.setItem("insightarena.cached_markets", "{not json");
    expect(getCachedMarkets()).toEqual([]);
  });

  it("falls back to an empty array when the stored value isn't an array", () => {
    window.localStorage.setItem("insightarena.cached_markets", JSON.stringify({ not: "an array" }));
    expect(getCachedMarkets()).toEqual([]);
  });

  it("serves stale markets while revalidating in the background", async () => {
    const updated = [
      { ...sample[0], price: "$41000.00" },
    ];
    let resolveFetch!: (markets: CachedMarket[]) => void;
    const revalidate = vi.fn(
      () => new Promise<CachedMarket[]>((resolve) => (resolveFetch = resolve)),
    );
    const listener = vi.fn();
    const unsubscribe = subscribeToMarketsCache(listener);
    cacheMarkets(sample);
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 31_000);
    setMarketsRevalidator(revalidate);

    expect(getCachedMarkets()).toEqual(sample);
    expect(revalidate).toHaveBeenCalledTimes(0);
    await Promise.resolve();
    expect(revalidate).toHaveBeenCalledTimes(1);

    resolveFetch(updated);
    await vi.waitFor(() => expect(listener).toHaveBeenCalledWith(updated));
    expect(getCachedMarkets()).toEqual(updated);
    unsubscribe();
  });

  it("serves a fresh cache without refetching", () => {
    const revalidate = vi.fn().mockResolvedValue(sample);
    cacheMarkets(sample);
    setMarketsRevalidator(revalidate);

    expect(getCachedMarkets()).toEqual(sample);
    expect(revalidate).not.toHaveBeenCalled();
  });

  it("does not serve data beyond the maximum stale window", async () => {
    const revalidate = vi.fn().mockResolvedValue(sample);
    cacheMarkets(sample);
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 5 * 60_000 + 1);
    setMarketsRevalidator(revalidate);

    expect(getCachedMarkets()).toEqual([]);
    await vi.waitFor(() => expect(revalidate).toHaveBeenCalledTimes(1));
  });
});
