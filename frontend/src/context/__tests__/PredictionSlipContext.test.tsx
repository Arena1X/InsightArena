import { renderHook, act } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, it, expect, beforeEach } from "vitest";
import {
  DEFAULT_MAX_SLIP_ITEMS,
  PredictionSlipProvider,
  usePredictionSlip,
} from "../PredictionSlipContext";

function makeItem(id: number) {
  return {
    marketId: `market-${id}`,
    marketTitle: `Market ${id}`,
    category: "Sports",
    outcome: "Yes",
    odds: 2.0,
  };
}

describe("PredictionSlipContext", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("prevents adding beyond the default cap with a clear message", () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <PredictionSlipProvider>{children}</PredictionSlipProvider>
    );
    const { result } = renderHook(() => usePredictionSlip(), { wrapper });

    expect(result.current.maxItems).toBe(DEFAULT_MAX_SLIP_ITEMS);

    act(() => {
      for (let i = 0; i < DEFAULT_MAX_SLIP_ITEMS; i += 1) {
        expect(result.current.addItem(makeItem(i))).toBe(true);
      }
    });

    expect(result.current.itemCount).toBe(DEFAULT_MAX_SLIP_ITEMS);
    expect(result.current.slipError).toBeNull();

    let added = true;
    act(() => {
      added = result.current.addItem(makeItem(DEFAULT_MAX_SLIP_ITEMS));
    });

    expect(added).toBe(false);
    expect(result.current.itemCount).toBe(DEFAULT_MAX_SLIP_ITEMS);
    expect(result.current.slipError).toContain(`${DEFAULT_MAX_SLIP_ITEMS}`);
  });

  it("allows adding again after removing an item", () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <PredictionSlipProvider maxItems={2}>{children}</PredictionSlipProvider>
    );
    const { result } = renderHook(() => usePredictionSlip(), { wrapper });

    act(() => {
      result.current.addItem(makeItem(1));
      result.current.addItem(makeItem(2));
    });

    act(() => {
      expect(result.current.addItem(makeItem(3))).toBe(false);
    });
    expect(result.current.slipError).not.toBeNull();

    act(() => {
      result.current.removeItem("market-1");
    });
    expect(result.current.itemCount).toBe(1);
    expect(result.current.slipError).toBeNull();

    act(() => {
      expect(result.current.addItem(makeItem(3))).toBe(true);
    });
    expect(result.current.itemCount).toBe(2);
    expect(result.current.items.map((i) => i.marketId)).toEqual([
      "market-2",
      "market-3",
    ]);
  });

  it("supports a configurable cap and still allows updating existing items at the cap", () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <PredictionSlipProvider maxItems={3}>{children}</PredictionSlipProvider>
    );
    const { result } = renderHook(() => usePredictionSlip(), { wrapper });

    expect(result.current.maxItems).toBe(3);

    act(() => {
      result.current.addItem(makeItem(1));
      result.current.addItem(makeItem(2));
      result.current.addItem(makeItem(3));
    });

    // Updating an existing market when at cap succeeds
    act(() => {
      expect(
        result.current.addItem({ ...makeItem(2), outcome: "No", odds: 1.5 }),
      ).toBe(true);
    });
    expect(result.current.itemCount).toBe(3);
    expect(result.current.items.find((i) => i.marketId === "market-2")?.outcome).toBe("No");

    // Adding a 4th distinct market is rejected
    act(() => {
      expect(result.current.addItem(makeItem(4))).toBe(false);
    });
    expect(result.current.itemCount).toBe(3);
    expect(result.current.slipError).toContain("3");
  });
});
