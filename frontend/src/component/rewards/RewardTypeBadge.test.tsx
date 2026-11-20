import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import RewardTypeBadge from "./RewardTypeBadge";
import { rewardTypeConfig, unknownRewardTypeDisplay, type RewardType } from "@/lib/rewards";

describe("RewardTypeBadge", () => {
  it("renders the configured label for every known reward type", () => {
    for (const type of Object.keys(rewardTypeConfig) as RewardType[]) {
      const { unmount } = render(<RewardTypeBadge type={type} />);
      expect(screen.getByText(rewardTypeConfig[type].label)).toBeInTheDocument();
      unmount();
    }
  });

  it("renders the fallback label instead of crashing for an unrecognized type", () => {
    // Simulates a value arriving from the backend that predates the
    // frontend's RewardType union (e.g. a new reward type added server-side
    // before this map is updated).
    render(<RewardTypeBadge type={"unknown-type" as RewardType} />);
    expect(screen.getByText(unknownRewardTypeDisplay.label)).toBeInTheDocument();
  });
});
