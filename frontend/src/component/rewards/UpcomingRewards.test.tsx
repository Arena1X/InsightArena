import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import UpcomingRewards from "./UpcomingRewards";
import type { UpcomingRewardCardProps } from "./UpcomingRewardCard";

const NOW = Date.parse("2026-08-25T12:00:00.000Z");

function itemAt(category: string, offsetMs: number): UpcomingRewardCardProps {
  return {
    category,
    amount: "$100",
    settlementDate: new Date(NOW + offsetMs).toISOString(),
  };
}

describe("UpcomingRewards", () => {
  it("groups items settling on the same calendar day under one heading", () => {
    const items = [
      itemAt("Morning reward", 2 * 60 * 60 * 1000), // same day, 2h out
      itemAt("Evening reward", 6 * 60 * 60 * 1000), // same day, 6h out
    ];

    render(<UpcomingRewards items={items} now={NOW} />);

    const dayHeadings = screen.getAllByText(new Date(NOW).toDateString());
    expect(dayHeadings).toHaveLength(1);
    expect(screen.getByText("Morning reward")).toBeInTheDocument();
    expect(screen.getByText("Evening reward")).toBeInTheDocument();
  });

  it("puts items on different calendar days under separate headings", () => {
    const items = [
      itemAt("Today's reward", 60 * 60 * 1000),
      itemAt("Next week's reward", 7 * 24 * 60 * 60 * 1000),
    ];

    render(<UpcomingRewards items={items} now={NOW} />);

    expect(screen.getByText(new Date(NOW).toDateString())).toBeInTheDocument();
    expect(
      screen.getByText(new Date(NOW + 7 * 24 * 60 * 60 * 1000).toDateString()),
    ).toBeInTheDocument();
  });

  it("collapses a past-due item into a separate 'Processing' group instead of a day heading", () => {
    const items = [
      itemAt("Upcoming reward", 60 * 60 * 1000),
      itemAt("Past-due reward", -60 * 1000),
    ];

    render(<UpcomingRewards items={items} now={NOW} />);

    expect(screen.getAllByText("Processing").length).toBeGreaterThan(0);
    expect(screen.getByText("Past-due reward")).toBeInTheDocument();
    expect(screen.getByText("Upcoming reward")).toBeInTheDocument();
  });

  it("shows an empty state when there are no items at all", () => {
    render(<UpcomingRewards items={[]} now={NOW} />);
    expect(screen.getByText("No upcoming rewards.")).toBeInTheDocument();
  });

  it("orders day groups chronologically, earliest first", () => {
    const items = [
      itemAt("Later reward", 3 * 24 * 60 * 60 * 1000),
      itemAt("Sooner reward", 60 * 60 * 1000),
    ];

    render(<UpcomingRewards items={items} now={NOW} />);

    const headings = screen.getAllByRole("heading", { level: 2 });
    // The <h2> is the section title; day-group labels are plain <p>s, so
    // assert ordering via the rendered category text instead.
    const soonerIndex = screen.getByText("Sooner reward").compareDocumentPosition(
      screen.getByText("Later reward"),
    );
    // Node.DOCUMENT_POSITION_FOLLOWING = 4: "Later reward" comes after "Sooner reward".
    expect(soonerIndex & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(headings).toHaveLength(1);
  });
});
