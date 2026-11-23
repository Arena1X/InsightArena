import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useLiveOddsWithAlerts } from "../useLiveOddsWithAlerts";
import * as useLiveOddsModule from "../useLiveOdds";
import type { UseLiveOddsResult } from "../useLiveOdds";

const mockCheckAlert = vi.fn();

vi.mock("@/context/PriceAlertContext", () => ({
  usePriceAlerts: () => ({
    checkAlert: mockCheckAlert,
  }),
}));

describe("useLiveOddsWithAlerts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should not trigger alerts on initial load", () => {
    const mockLiveOddsResult: UseLiveOddsResult = {
      odds: {
        marketId: "market-1",
        yesOdds: 0.6,
        noOdds: 0.4,
        updatedAt: Date.now(),
      },
      pool: null,
      status: "connected",
      lastUpdatedAt: Date.now(),
      isStale: false,
      getFreshOdds: vi.fn(),
    };

    vi.spyOn(useLiveOddsModule, "useLiveOdds").mockReturnValue(
      mockLiveOddsResult,
    );

    renderHook(() => useLiveOddsWithAlerts("market-1"));

    // On initial load, checkAlert should not be called
    expect(mockCheckAlert).not.toHaveBeenCalled();
  });

  it("should trigger alert check when odds change", async () => {
    let mockLiveOddsResult: UseLiveOddsResult = {
      odds: {
        marketId: "market-1",
        yesOdds: 0.5,
        noOdds: 0.5,
        updatedAt: Date.now(),
      },
      pool: null,
      status: "connected",
      lastUpdatedAt: Date.now(),
      isStale: false,
      getFreshOdds: vi.fn(),
    };

    const useLiveOddsSpy = vi
      .spyOn(useLiveOddsModule, "useLiveOdds")
      .mockReturnValue(mockLiveOddsResult);

    const { rerender } = renderHook(() => useLiveOddsWithAlerts("market-1"));

    // Initial load - no check
    expect(mockCheckAlert).not.toHaveBeenCalled();

    // Update odds
    mockLiveOddsResult = {
      ...mockLiveOddsResult,
      odds: {
        marketId: "market-1",
        yesOdds: 0.6,
        noOdds: 0.4,
        updatedAt: Date.now(),
      },
    };
    useLiveOddsSpy.mockReturnValue(mockLiveOddsResult);

    rerender();

    await waitFor(() => {
      expect(mockCheckAlert).toHaveBeenCalledWith(
        "market-1",
        0.6,
        0.4,
        0.5,
        0.5,
      );
    });
  });

  it("should reset state when market changes", async () => {
    let mockLiveOddsResult: UseLiveOddsResult = {
      odds: {
        marketId: "market-1",
        yesOdds: 0.5,
        noOdds: 0.5,
        updatedAt: Date.now(),
      },
      pool: null,
      status: "connected",
      lastUpdatedAt: Date.now(),
      isStale: false,
      getFreshOdds: vi.fn(),
    };

    const useLiveOddsSpy = vi
      .spyOn(useLiveOddsModule, "useLiveOdds")
      .mockReturnValue(mockLiveOddsResult);

    const { rerender } = renderHook(
      ({ marketId }) => useLiveOddsWithAlerts(marketId),
      { initialProps: { marketId: "market-1" } },
    );

    // Update odds for market-1
    mockLiveOddsResult = {
      ...mockLiveOddsResult,
      odds: {
        marketId: "market-1",
        yesOdds: 0.6,
        noOdds: 0.4,
        updatedAt: Date.now(),
      },
    };
    useLiveOddsSpy.mockReturnValue(mockLiveOddsResult);
    rerender({ marketId: "market-1" });

    await waitFor(() => {
      expect(mockCheckAlert).toHaveBeenCalledTimes(1);
    });

    mockCheckAlert.mockClear();

    // Change market
    mockLiveOddsResult = {
      ...mockLiveOddsResult,
      odds: {
        marketId: "market-2",
        yesOdds: 0.7,
        noOdds: 0.3,
        updatedAt: Date.now(),
      },
    };
    useLiveOddsSpy.mockReturnValue(mockLiveOddsResult);
    rerender({ marketId: "market-2" });

    // First odds update for new market should not trigger check
    expect(mockCheckAlert).not.toHaveBeenCalled();
  });

  it("should handle null marketId", () => {
    const mockLiveOddsResult: UseLiveOddsResult = {
      odds: null,
      pool: null,
      status: "disconnected",
      lastUpdatedAt: null,
      isStale: false,
      getFreshOdds: vi.fn(),
    };

    vi.spyOn(useLiveOddsModule, "useLiveOdds").mockReturnValue(
      mockLiveOddsResult,
    );

    renderHook(() => useLiveOddsWithAlerts(null));

    expect(mockCheckAlert).not.toHaveBeenCalled();
  });

  it("should handle odds without previous reference", () => {
    const mockLiveOddsResult: UseLiveOddsResult = {
      odds: null,
      pool: null,
      status: "connected",
      lastUpdatedAt: null,
      isStale: false,
      getFreshOdds: vi.fn(),
    };

    const useLiveOddsSpy = vi
      .spyOn(useLiveOddsModule, "useLiveOdds")
      .mockReturnValue(mockLiveOddsResult);

    const { rerender } = renderHook(() => useLiveOddsWithAlerts("market-1"));

    // Update with odds after initial null
    const updatedResult: UseLiveOddsResult = {
      ...mockLiveOddsResult,
      odds: {
        marketId: "market-1",
        yesOdds: 0.5,
        noOdds: 0.5,
        updatedAt: Date.now(),
      },
    };
    useLiveOddsSpy.mockReturnValue(updatedResult);
    rerender();

    // Should not trigger on first odds after null
    expect(mockCheckAlert).not.toHaveBeenCalled();
  });
});
