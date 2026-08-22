import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useCoachInsights } from "./useCoachInsights";
import { useWallet } from "@/context/WalletContext";
import { getCoachInsights } from "@/lib/coach";
import type { CoachInsightsResponse } from "@/lib/coach";

vi.mock("@/context/WalletContext", () => ({
  useWallet: vi.fn(),
}));

vi.mock("@/lib/coach", () => ({
  getCoachInsights: vi.fn(),
}));

const mockedUseWallet = vi.mocked(useWallet);
const mockedGetCoachInsights = vi.mocked(getCoachInsights);

function mockWallet(
  address: string | null,
  token: string | null = address ? "test-token" : null,
) {
  mockedUseWallet.mockReturnValue({
    address,
    token,
  } as unknown as ReturnType<typeof useWallet>);
}

function buildHistoryResponse(): CoachInsightsResponse {
  return {
    has_history: true,
    message: null,
    insights: {
      accuracy_trend: {
        direction: "improving",
        recent_accuracy: 80,
        prior_accuracy: 50,
      },
      best_category: {
        category: "Crypto",
        predictions: 10,
        correct: 8,
        accuracy_rate: "80.0",
      },
      worst_category: null,
      current_streak: 3,
      longest_streak: 6,
      total_resolved: 15,
      generated_at: "2026-08-19T10:00:00Z",
    },
  };
}

describe("useCoachInsights", () => {
  beforeEach(() => {
    mockedUseWallet.mockReset();
    mockedGetCoachInsights.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("transitions from loading to success and reports hasHistory", async () => {
    const response = buildHistoryResponse();
    mockWallet("GADDRESS");
    mockedGetCoachInsights.mockResolvedValue(response);

    const { result } = renderHook(() => useCoachInsights());

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.insights).toEqual(response);
    expect(result.current.hasHistory).toBe(true);
    expect(result.current.error).toBeNull();
    expect(mockedGetCoachInsights).toHaveBeenCalledWith("test-token");
  });

  it("reports hasHistory=false for the insufficient-history response", async () => {
    mockWallet("GADDRESS");
    mockedGetCoachInsights.mockResolvedValue({
      has_history: false,
      message: "Make a few more predictions…",
      insights: null,
    });

    const { result } = renderHook(() => useCoachInsights());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.insights?.has_history).toBe(false);
    expect(result.current.hasHistory).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("transitions from loading to error when the fetch rejects", async () => {
    mockWallet("GADDRESS");
    mockedGetCoachInsights.mockRejectedValue(new Error("network down"));

    const { result } = renderHook(() => useCoachInsights());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toBe(
      "Network error. Please check your connection and try again.",
    );
    expect(result.current.insights).toBeNull();
    expect(result.current.hasHistory).toBe(false);
  });

  it("short-circuits and never calls getCoachInsights when no wallet is connected", async () => {
    mockWallet(null);

    const { result } = renderHook(() => useCoachInsights());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockedGetCoachInsights).not.toHaveBeenCalled();
    expect(result.current.insights).toBeNull();
  });
});
