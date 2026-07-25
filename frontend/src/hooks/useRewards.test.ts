import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useRewards } from "./useRewards";
import { useWallet } from "@/context/WalletContext";
import { claimRewards, getRewardsSummary } from "@/lib/rewards";
import type { RewardsSummary } from "@/lib/rewards";

vi.mock("@/context/WalletContext", () => ({
  useWallet: vi.fn(),
}));

vi.mock("@/lib/rewards", () => ({
  getRewardsSummary: vi.fn(),
  claimRewards: vi.fn(),
}));

const mockedUseWallet = vi.mocked(useWallet);
const mockedGetRewardsSummary = vi.mocked(getRewardsSummary);
const mockedClaimRewards = vi.mocked(claimRewards);

function mockWallet(address: string | null, token: string | null = address ? "test-token" : null) {
  mockedUseWallet.mockReturnValue({
    address,
    token,
  } as unknown as ReturnType<typeof useWallet>);
}

function buildSummary(overrides: Partial<RewardsSummary> = {}): RewardsSummary {
  return {
    totalEarnedXlm: 1240,
    claimableXlm: 150,
    vestingXlm: 95,
    ...overrides,
  };
}

describe("useRewards", () => {
  beforeEach(() => {
    mockedUseWallet.mockReset();
    mockedGetRewardsSummary.mockReset();
    mockedClaimRewards.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("transitions from loading to success when the summary resolves", async () => {
    const summary = buildSummary();
    mockWallet("GADDRESS");
    mockedGetRewardsSummary.mockResolvedValue(summary);

    const { result } = renderHook(() => useRewards());

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.summary).toEqual(summary);
    expect(result.current.error).toBeNull();
    expect(result.current.hasClaimableRewards).toBe(true);
    expect(result.current.isEmpty).toBe(false);
    expect(mockedGetRewardsSummary).toHaveBeenCalledWith("test-token");
  });

  it("transitions from loading to error when the fetch rejects", async () => {
    mockWallet("GADDRESS");
    mockedGetRewardsSummary.mockRejectedValue(new Error("network down"));

    const { result } = renderHook(() => useRewards());

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toBe(
      "Network error. Please check your connection and try again.",
    );
    expect(result.current.summary).toBeNull();
  });

  it("reports isEmpty when the wallet has no rewards at all", async () => {
    mockWallet("GADDRESS");
    mockedGetRewardsSummary.mockResolvedValue(
      buildSummary({ claimableXlm: 0, vestingXlm: 0, totalEarnedXlm: 0 }),
    );

    const { result } = renderHook(() => useRewards());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.isEmpty).toBe(true);
    expect(result.current.hasClaimableRewards).toBe(false);
  });

  it("short-circuits and never calls getRewardsSummary when no wallet is connected", async () => {
    mockWallet(null);

    const { result } = renderHook(() => useRewards());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockedGetRewardsSummary).not.toHaveBeenCalled();
    expect(result.current.summary).toBeNull();
  });

  it("claims rewards and updates balances on success", async () => {
    mockWallet("GADDRESS");
    mockedGetRewardsSummary.mockResolvedValue(buildSummary());
    mockedClaimRewards.mockResolvedValue({
      claimedXlm: 150,
      claimedCount: 1,
      transactionHash: "tx_abc123",
      summary: buildSummary({ claimableXlm: 0, totalEarnedXlm: 1240 }),
    });

    const { result } = renderHook(() => useRewards());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.claimStatus).toBe("idle");

    await act(async () => {
      await result.current.claim();
    });

    expect(mockedClaimRewards).toHaveBeenCalledWith("test-token");
    expect(result.current.claimStatus).toBe("success");
    expect(result.current.summary?.claimableXlm).toBe(0);
    expect(result.current.lastClaimedXlm).toBe(150);
    expect(result.current.lastTransactionHash).toBe("tx_abc123");
  });

  it("sets claimStatus to error when the claim request fails", async () => {
    mockWallet("GADDRESS");
    mockedGetRewardsSummary.mockResolvedValue(buildSummary());
    mockedClaimRewards.mockRejectedValue(new Error("Claim rejected"));

    const { result } = renderHook(() => useRewards());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.claim();
    });

    expect(result.current.claimStatus).toBe("error");
    expect(result.current.claimError).toBe("Claim rejected");
  });

  it("does not call claimRewards when there is nothing claimable", async () => {
    mockWallet("GADDRESS");
    mockedGetRewardsSummary.mockResolvedValue(
      buildSummary({ claimableXlm: 0 }),
    );

    const { result } = renderHook(() => useRewards());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.claim();
    });

    expect(mockedClaimRewards).not.toHaveBeenCalled();
    expect(result.current.claimStatus).toBe("idle");
  });
});
