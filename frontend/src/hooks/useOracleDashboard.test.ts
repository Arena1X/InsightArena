import { describe, expect, it } from "vitest";

import {
  buildPendingQueue,
  type PendingResolution,
} from "./useOracleDashboard";

const NOW = Date.parse("2026-09-23T12:00:00.000Z");

function makeItem(
  marketId: string,
  title: string,
  closedAt: string,
): PendingResolution {
  return {
    marketId,
    title,
    category: "Sports",
    closedAt,
    outcomes: ["A", "B"],
    participantCount: 10,
  };
}

describe("buildPendingQueue", () => {
  const items = [
    makeItem("later", "Lakers vs Celtics", "2026-09-23T15:00:00.000Z"),
    makeItem("overdue-old", "Arsenal vs Chelsea", "2026-09-23T08:00:00.000Z"),
    makeItem("overdue-recent", "Madrid vs Barca", "2026-09-23T11:00:00.000Z"),
  ];

  it("orders the queue by soonest deadline first", () => {
    const queue = buildPendingQueue(items, NOW);
    expect(queue.map((item) => item.marketId)).toEqual([
      "overdue-old",
      "overdue-recent",
      "later",
    ]);
  });

  it("flags overdue rows when the deadline is in the past", () => {
    const queue = buildPendingQueue(items, NOW);
    expect(queue.find((item) => item.marketId === "overdue-old")?.isOverdue).toBe(
      true,
    );
    expect(
      queue.find((item) => item.marketId === "overdue-recent")?.isOverdue,
    ).toBe(true);
    expect(queue.find((item) => item.marketId === "later")?.isOverdue).toBe(
      false,
    );
  });
});
