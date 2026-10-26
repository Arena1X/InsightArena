import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PredictionSlipProvider, usePredictionSlip } from "../PredictionSlipContext";

describe("PredictionSlipContext", () => {
  it("updates the outcome and its implied odds", () => {
    const { result } = renderHook(() => usePredictionSlip(), {
      wrapper: PredictionSlipProvider,
    });

    act(() => {
      result.current.addItem({
        marketId: "market-1",
        marketTitle: "Will it rain?",
        category: "weather",
        outcome: "Yes",
        odds: 1 / 0.6,
        marketProbability: 0.6,
        poolLiquidity: 500,
      });
      result.current.updateOutcome("market-1", "No");
    });

    expect(result.current.items[0].outcome).toBe("No");
    expect(result.current.items[0].odds).toBeCloseTo(2.5);
  });
});
