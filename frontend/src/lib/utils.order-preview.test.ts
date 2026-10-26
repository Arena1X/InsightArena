import { describe, expect, it } from "vitest";
import {
  calculateOrderPreview,
  DEFAULT_CREATOR_FEE_BPS,
  DEFAULT_PLATFORM_FEE_BPS,
  PRICE_IMPACT_WARNING_THRESHOLD_PCT,
} from "./utils";

describe("calculateOrderPreview", () => {
  it("estimates fees, net stake, shares, and price impact", () => {
    const preview = calculateOrderPreview({
      stake: 100,
      odds: 2,
      poolLiquidity: 500,
    });

    expect(preview.platformFee).toBe(2.5);
    expect(preview.creatorFee).toBe(1);
    expect(preview.netStake).toBeCloseTo(96.5);
    expect(preview.netCost).toBe(100);
    expect(preview.estimatedShares).toBeCloseTo(193);
    expect(preview.estimatedPriceImpactPct).toBeCloseTo(16.18);
    expect(preview.warnsAboutPriceImpact).toBe(true);
  });

  it("does not warn when impact stays below the threshold", () => {
    const preview = calculateOrderPreview({
      stake: 10,
      odds: 2,
      poolLiquidity: 1_000,
      platformFeeBps: DEFAULT_PLATFORM_FEE_BPS,
      creatorFeeBps: DEFAULT_CREATOR_FEE_BPS,
    });

    expect(preview.estimatedPriceImpactPct).toBeLessThan(
      PRICE_IMPACT_WARNING_THRESHOLD_PCT,
    );
    expect(preview.warnsAboutPriceImpact).toBe(false);
  });

  it("marks price impact unavailable when pool depth is missing", () => {
    const preview = calculateOrderPreview({ stake: 10, odds: 2, poolLiquidity: 0 });

    expect(preview.estimatedPriceImpactPct).toBeNull();
    expect(preview.warnsAboutPriceImpact).toBe(false);
  });
});
