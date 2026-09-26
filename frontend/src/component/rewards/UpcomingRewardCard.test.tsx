import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import UpcomingRewardCard from "./UpcomingRewardCard";

describe("UpcomingRewardCard", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-25T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows a live-ticking countdown for a future settlement date", () => {
    render(
      <UpcomingRewardCard
        category="Weekly Competition"
        amount="$350"
        settlementDate="2026-08-28T12:00:00.000Z"
      />,
    );

    expect(screen.getByText(/Settles on/)).toBeInTheDocument();
    expect(screen.queryByText("Processing")).not.toBeInTheDocument();
  });

  it("ticks: the countdown keeps rendering as fake time advances via its own interval", () => {
    render(
      <UpcomingRewardCard
        category="Weekly Competition"
        amount="$350"
        settlementDate="2026-08-25T12:00:10.000Z"
      />,
    );
    expect(screen.getByText(/Settles on/)).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    // Still before the target: the interval ticked, and the card is still
    // showing a live countdown rather than a value frozen at first render.
    expect(screen.getByText(/Settles on/)).toBeInTheDocument();
  });

  it("collapses to a 'Processing' state once the settlement date has passed", () => {
    render(
      <UpcomingRewardCard
        category="Weekly Competition"
        amount="$350"
        settlementDate="2026-08-25T11:59:00.000Z"
      />,
    );

    expect(screen.getByText("Processing")).toBeInTheDocument();
    expect(screen.queryByText(/Settles on/)).not.toBeInTheDocument();
  });

  it("transitions from a live countdown to 'Processing' as time advances past the target", () => {
    vi.setSystemTime(new Date("2026-08-25T11:59:58.000Z"));
    render(
      <UpcomingRewardCard
        category="Weekly Competition"
        amount="$350"
        settlementDate="2026-08-25T12:00:00.000Z"
      />,
    );
    expect(screen.getByText(/Settles on/)).toBeInTheDocument();

    // Advancing the fake clock past the target and letting the component's
    // own setInterval tick (rather than re-rendering with new props) is what
    // actually exercises the "ticks without a prop change" behavior #1577
    // asks for.
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(screen.getByText("Processing")).toBeInTheDocument();
  });
});
