import { describe, expect, it } from "vitest";

import { normalizeOddsUpdate } from "./useLiveOdds";

describe("normalizeOddsUpdate pool data", () => {
  it("reflects a new stake in the pool and average", () => {
    const first = normalizeOddsUpdate("market-1", {
      total_pool_xlm: 100,
      contributor_count: 4,
    });
    const next = normalizeOddsUpdate("market-1", {
      total_pool_xlm: 150,
      contributor_count: 5,
    });

    expect(first.pool).toEqual({ poolXlm: 100, contributorCount: 4, averageStakeXlm: 25 });
    expect(next.pool).toEqual({ poolXlm: 150, contributorCount: 5, averageStakeXlm: 30 });
  });

  it("derives pool totals from backend odds rows", () => {
    const update = normalizeOddsUpdate("market-1", {
      odds: [
        { count: 2, total_staked_stroops: "100000000" },
        { count: 3, total_staked_stroops: "50000000" },
      ],
    });

    expect(update.pool).toEqual({ poolXlm: 15, contributorCount: 5, averageStakeXlm: 3 });
  });
});