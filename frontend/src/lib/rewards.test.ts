import { describe, expect, it } from "vitest";
import { getRewardTypeDisplay, rewardTypeConfig, unknownRewardTypeDisplay } from "./rewards";

describe("getRewardTypeDisplay", () => {
  it("returns the configured label/color for every known reward type", () => {
    for (const [type, expected] of Object.entries(rewardTypeConfig)) {
      expect(getRewardTypeDisplay(type)).toEqual(expected);
    }
  });

  it("falls back to unknownRewardTypeDisplay for an unrecognized type", () => {
    expect(getRewardTypeDisplay("not-a-real-type")).toEqual(unknownRewardTypeDisplay);
  });

  it("falls back for an empty string", () => {
    expect(getRewardTypeDisplay("")).toEqual(unknownRewardTypeDisplay);
  });
});
