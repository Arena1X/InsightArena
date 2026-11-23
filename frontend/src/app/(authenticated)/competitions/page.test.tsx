/**
 * Tests for Bracket visualization for competitions — Issue #2156
 *
 * Covers:
 *  1. The bracket renders rounds and matchups from data.
 *  2. The current round and completed matchups are highlighted.
 *  3. The bracket scrolls horizontally on narrow viewports.
 *  4. CompetitionsPage displays the bracket and allows switching competitions.
 */

import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import CompetitionBracket, {
  type BracketRound,
} from "@/component/competitions/CompetitionBracket";
import CompetitionsPage from "./page";

vi.mock("@/context/WalletContext", () => ({
  useWallet: () => ({
    address: null,
    isAuthenticated: false,
  }),
}));

vi.mock("@/lib/eventRewards", () => ({
  claimPayout: vi.fn(),
  finalizeEvent: vi.fn(),
  getUserPayout: vi.fn().mockResolvedValue(null),
}));

const mockRounds: BracketRound[] = [
  {
    id: "round-1",
    name: "Quarterfinals",
    isCurrent: false,
    matchups: [
      {
        id: "m1",
        status: "completed",
        winnerId: "u1",
        scheduledAt: "May 01",
        home: { id: "u1", name: "Alice", seed: 1, score: 90 },
        away: { id: "u4", name: "Dave", seed: 4, score: 72 },
      },
      {
        id: "m2",
        status: "completed",
        winnerId: "u2",
        scheduledAt: "May 01",
        home: { id: "u2", name: "Bob", seed: 2, score: 85 },
        away: { id: "u3", name: "Carol", seed: 3, score: 80 },
      },
    ],
  },
  {
    id: "round-2",
    name: "Semifinals",
    isCurrent: true,
    matchups: [
      {
        id: "m3",
        status: "live",
        winnerId: null,
        scheduledAt: "Live now",
        home: { id: "u1", name: "Alice", seed: 1, score: 44 },
        away: { id: "u2", name: "Bob", seed: 2, score: 41 },
      },
    ],
  },
  {
    id: "round-3",
    name: "Final",
    isCurrent: false,
    matchups: [
      {
        id: "m4",
        status: "upcoming",
        winnerId: null,
        scheduledAt: "May 10",
        home: null,
        away: null,
      },
    ],
  },
];

describe("CompetitionBracket (Issue #2156)", () => {
  it("renders rounds and matchups from data", () => {
    render(<CompetitionBracket title="Spring Cup" rounds={mockRounds} />);

    expect(screen.getByText("Spring Cup")).toBeInTheDocument();

    // All round headers rendered
    expect(screen.getByText("Quarterfinals")).toBeInTheDocument();
    expect(screen.getByText("Semifinals")).toBeInTheDocument();
    expect(screen.getByText("Final")).toBeInTheDocument();

    // Matchup cards and participants rendered inside their respective rounds
    const qfRound = screen.getByTestId("bracket-round-round-1");
    expect(within(qfRound).getByTestId("bracket-matchup-m1")).toBeInTheDocument();
    expect(within(qfRound).getByTestId("bracket-matchup-m2")).toBeInTheDocument();
    expect(within(qfRound).getByText("Alice")).toBeInTheDocument();
    expect(within(qfRound).getByText("Dave")).toBeInTheDocument();
    expect(within(qfRound).getByText("Bob")).toBeInTheDocument();
    expect(within(qfRound).getByText("Carol")).toBeInTheDocument();

    // Completed matchups and winners are highlighted
    const completedMatchup = screen.getByTestId("bracket-matchup-m1");
    expect(completedMatchup).toHaveAttribute("data-status", "completed");
    expect(completedMatchup.className).toContain("border-emerald-500/40");
    const winnerRow = within(completedMatchup)
      .getByText("Alice")
      .closest("[data-winner]");
    expect(winnerRow).toHaveAttribute("data-winner", "true");

    // Upcoming matchup renders TBD slots
    const finalMatchup = screen.getByTestId("bracket-matchup-m4");
    expect(within(finalMatchup).getAllByText("TBD")).toHaveLength(2);
  });

  it("highlights the current round", () => {
    render(<CompetitionBracket title="Spring Cup" rounds={mockRounds} />);

    const currentRound = screen.getByTestId("bracket-round-round-2");
    const pastRound = screen.getByTestId("bracket-round-round-1");
    const futureRound = screen.getByTestId("bracket-round-round-3");

    expect(currentRound).toHaveAttribute("data-current", "true");
    expect(currentRound).toHaveAttribute("aria-current", "step");
    expect(currentRound.className).toContain("border-orange-500/50");
    expect(within(currentRound).getByText("Current Round")).toBeInTheDocument();

    expect(pastRound).toHaveAttribute("data-current", "false");
    expect(pastRound).not.toHaveAttribute("aria-current");
    expect(futureRound).toHaveAttribute("data-current", "false");
    expect(futureRound).not.toHaveAttribute("aria-current");
  });

  it("scrolls horizontally on narrow viewports", () => {
    render(<CompetitionBracket title="Spring Cup" rounds={mockRounds} />);

    const scrollContainer = screen.getByTestId("bracket-scroll-container");
    const roundsTrack = screen.getByTestId("bracket-rounds-track");

    // Responsive horizontal scroll classes and keyboard-focusable region
    expect(scrollContainer.className).toContain("overflow-x-auto");
    expect(scrollContainer.className).toContain("w-full");
    expect(scrollContainer).toHaveAttribute("tabIndex", "0");
    expect(roundsTrack.className).toContain("min-w-max");

    // Simulate a narrow viewport where content width exceeds container width
    Object.defineProperty(scrollContainer, "clientWidth", {
      configurable: true,
      value: 320,
    });
    Object.defineProperty(scrollContainer, "scrollWidth", {
      configurable: true,
      value: 960,
    });

    expect(scrollContainer.scrollWidth).toBeGreaterThan(
      scrollContainer.clientWidth,
    );

    scrollContainer.scrollLeft = 240;
    fireEvent.scroll(scrollContainer);
    expect(scrollContainer.scrollLeft).toBe(240);
  });

  it("renders a readable bracket diagram on CompetitionsPage and switches between competitions", () => {
    render(<CompetitionsPage />);

    // Default active competition bracket is visible
    expect(
      screen.getByRole("region", {
        name: "Scrollable competition bracket diagram",
      }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("bracket-round-qf")).toBeInTheDocument();
    expect(screen.getByTestId("bracket-round-sf")).toHaveAttribute(
      "data-current",
      "true",
    );

    // Switch to another competition's bracket
    const viewBracketButtons = screen.getAllByRole("button", {
      name: "View Bracket",
    });
    expect(viewBracketButtons.length).toBeGreaterThan(0);
    fireEvent.click(viewBracketButtons[0]);

    expect(screen.getByTestId("bracket-round-r1")).toHaveAttribute(
      "data-current",
      "true",
    );
  });
});
