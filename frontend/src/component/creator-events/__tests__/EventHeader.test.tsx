import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import EventHeader from "../EventHeader";

const baseFixture = {
  title: "Championship Tournament",
  description: "Epic creator prediction challenge.",
  creator: "GCF5T...9V2H",
  status: "Active" as const,
  participants: 45,
  maxParticipants: 100,
  createdAt: "2026-01-01T00:00:00Z",
  startsAt: "2026-10-01T12:00:00Z",
  endsAt: "2026-10-15T23:59:59Z",
  inviteCode: "CHAMP-2026",
  category: "Esports",
};

describe("EventHeader", () => {
  it("renders event title, status, countdown to start, and capacity meter from fixture", () => {
    render(<EventHeader {...baseFixture} />);

    expect(screen.getByText("Championship Tournament")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByTestId("time-to-start")).toBeInTheDocument();
    expect(screen.getByText("Time to Start")).toBeInTheDocument();

    const capacityMeter = screen.getByTestId("capacity-meter");
    expect(capacityMeter).toBeInTheDocument();
    expect(screen.getByTestId("capacity-text")).toHaveTextContent("45 / 100 (45%)");
  });

  it("renders full state and waitlist hint when participants reach max capacity derived from fixture", () => {
    const fullFixture = {
      ...baseFixture,
      participants: 100,
      maxParticipants: 100,
      hasWaitlist: true,
      waitlistHint: "Waitlist active! Sign up to claim open spots.",
      onJoin: vi.fn(),
    };

    render(<EventHeader {...fullFixture} />);

    expect(screen.getByTestId("capacity-pill")).toHaveTextContent("100 / 100 (Full)");
    expect(screen.getByTestId("full-badge")).toHaveTextContent("Event Full — Maximum capacity reached");
    expect(screen.getByTestId("waitlist-hint")).toHaveTextContent("Waitlist active! Sign up to claim open spots.");

    const joinButton = screen.getByTestId("header-join-button");
    expect(joinButton).toBeDisabled();
    expect(joinButton).toHaveTextContent("Event Full");
  });

  it("enables join button when event is not full and onJoin is provided", () => {
    const onJoinMock = vi.fn();
    render(<EventHeader {...baseFixture} onJoin={onJoinMock} />);

    const joinButton = screen.getByTestId("header-join-button");
    expect(joinButton).not.toBeDisabled();
    expect(joinButton).toHaveTextContent("Join Event");
  });
});
