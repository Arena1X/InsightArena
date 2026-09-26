import { describe, expect, it } from "vitest";

import { appendUniqueByKey } from "./useInfiniteScroll";

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
