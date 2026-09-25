import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PoolStats } from "@/lib/utils";
import PrizePoolSummary from "./PrizePoolSummary";

let livePool: PoolStats | null = null;

vi.mock("@/hooks/useLiveOdds", () => ({
  useLiveOdds: () => ({
    odds: null,
    pool: livePool,
    status: "connected",
    lastUpdatedAt: Date.now(),
  }),
}));

describe("PrizePoolSummary live updates", () => {
  beforeEach(() => {
    livePool = { poolXlm: 100, contributorCount: 4, averageStakeXlm: 25 };
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(performance.now() + 300);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });

  it("updates the displayed figure and average after a new stake event", () => {
    const { rerender } = render(
      <PrizePoolSummary prizePoolXlm={50} rewardBreakdown={[]} marketId="market-1" />,
    );

    expect(screen.getByText("100 XLM")).toBeInTheDocument();
    expect(screen.getByText("25 XLM")).toBeInTheDocument();

    livePool = { poolXlm: 150, contributorCount: 5, averageStakeXlm: 30 };
    rerender(<PrizePoolSummary prizePoolXlm={50} rewardBreakdown={[]} marketId="market-1" />);

    expect(screen.getByText("150 XLM")).toBeInTheDocument();
    expect(screen.getByText("30 XLM")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
  });
});