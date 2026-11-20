import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import DisputeList from "./DisputeList";
import type { MarketDispute } from "@/hooks/useMarketDisputes";

function buildDispute(overrides: Partial<MarketDispute> = {}): MarketDispute {
  return {
    id: "d1",
    marketId: "m1",
    category: "incorrect_outcome",
    reason: "The reported outcome does not match the event result.",
    status: "pending",
    createdAt: "2026-08-01T00:00:00Z",
    evidenceUrls: [],
    ...overrides,
  };
}

describe("DisputeList", () => {
  it("shows a loading skeleton", () => {
    render(<DisputeList disputes={[]} loading />);
    expect(screen.queryByTestId("dispute-item")).not.toBeInTheDocument();
  });

  it("shows the error state", () => {
    render(<DisputeList disputes={[]} error="Failed to load disputes." />);
    expect(screen.getByText("Failed to load disputes.")).toBeInTheDocument();
  });

  it("shows an empty state when there are no disputes", () => {
    render(<DisputeList disputes={[]} />);
    expect(screen.getByText("No disputes yet")).toBeInTheDocument();
  });

  it("renders the category label, reason, and status for each dispute", () => {
    render(
      <DisputeList
        disputes={[
          buildDispute({ category: "manipulation", status: "under_review" }),
        ]}
      />,
    );

    expect(screen.getByText("Market manipulation")).toBeInTheDocument();
    expect(
      screen.getByText("The reported outcome does not match the event result."),
    ).toBeInTheDocument();
    expect(screen.getByText("under review")).toBeInTheDocument();
  });

  it("shows a 'Filing…' status with a spinner for an optimistic dispute", () => {
    render(
      <DisputeList disputes={[buildDispute({ isOptimistic: true })]} />,
    );

    const item = screen.getByTestId("dispute-item");
    expect(item).toHaveTextContent("Filing…");
    expect(screen.getByTestId("dispute-optimistic-spinner")).toBeInTheDocument();
    expect(item).toHaveAttribute("aria-busy", "true");
  });

  it("does not show the optimistic spinner for a confirmed dispute", () => {
    render(<DisputeList disputes={[buildDispute({ isOptimistic: false })]} />);

    expect(
      screen.queryByTestId("dispute-optimistic-spinner"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("pending")).toBeInTheDocument();
  });

  it("renders evidence links when present", () => {
    render(
      <DisputeList
        disputes={[
          buildDispute({ evidenceUrls: ["https://example.com/proof.png"] }),
        ]}
      />,
    );

    const link = screen.getByRole("link", { name: "https://example.com/proof.png" });
    expect(link).toHaveAttribute("href", "https://example.com/proof.png");
  });
});
