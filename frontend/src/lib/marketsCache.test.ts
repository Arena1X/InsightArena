import { afterEach, describe, expect, it } from "vitest";
import { cacheMarkets, getCachedMarkets, type CachedMarket } from "./marketsCache";

const sample: CachedMarket[] = [
  { name: "Bitcoin", price: "$39422.76", volume: "2.1B", change: "+10.29%", isFavorite: false },
  { name: "Ethereum", price: "$2000.00", volume: "1.0B", change: "-1.77%", isFavorite: true },
];

describe("marketsCache", () => {
  afterEach(() => {
    window.localStorage.clear();
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
});
