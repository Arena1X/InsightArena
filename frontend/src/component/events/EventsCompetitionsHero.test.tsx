import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import EventsCompetitionsHero from "./EventsCompetitionsHero";

describe("EventsCompetitionsHero", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("rotates through featured events", () => {
    render(<EventsCompetitionsHero />);

    expect(screen.getByRole("heading", { name: "Apollo Tournament" })).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(screen.getByRole("heading", { name: "Rising Stars Invite" })).toBeInTheDocument();
  });

  it("pauses rotation while hovered", () => {
    render(<EventsCompetitionsHero />);
    const carousel = screen.getByRole("region", { name: "Featured events" });

    fireEvent.mouseEnter(carousel);
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(screen.getByRole("heading", { name: "Apollo Tournament" })).toBeInTheDocument();
  });

  it("navigates with previous, next, and dot controls", () => {
    render(<EventsCompetitionsHero />);

    fireEvent.click(screen.getByRole("button", { name: "Next featured event" }));
    expect(screen.getByRole("heading", { name: "Rising Stars Invite" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Previous featured event" }));
    expect(screen.getByRole("heading", { name: "Apollo Tournament" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show Season Finale Challenge" }));
    expect(screen.getByRole("heading", { name: "Season Finale Challenge" })).toBeInTheDocument();
  });
});
