import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ParticipantList, {
  type EventParticipantRow,
} from "../ParticipantList";

function buildParticipant(
  overrides: Partial<EventParticipantRow> = {},
): EventParticipantRow {
  return {
    address: "GALP2...Z91Q",
    joinedAt: "2026-05-06T14:30:00Z",
    correctPredictions: 3,
    totalMatches: 5,
    ...overrides,
  };
}

describe("ParticipantList", () => {
  it("renders the empty state when there are no participants at all", () => {
    render(<ParticipantList participants={[]} />);

    expect(
      screen.getByText("No participants have joined this event yet."),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/search participants/i)).not.toBeInTheDocument();
  });

  it("renders every participant row with wallet address, join date, and score", () => {
    const participants = [
      buildParticipant({ address: "GALP2...Z91Q" }),
      buildParticipant({ address: "GC7RB...1KYV", correctPredictions: 2, totalMatches: 5 }),
    ];

    render(<ParticipantList participants={participants} />);

    expect(screen.getAllByTestId("participant-row")).toHaveLength(2);
    expect(screen.getByText("GALP2...Z91Q")).toBeInTheDocument();
    expect(screen.getByText("GC7RB...1KYV")).toBeInTheDocument();
    expect(screen.getByText("3 / 5")).toBeInTheDocument();
    expect(screen.getByText("2 / 5")).toBeInTheDocument();
  });

  it("filters participants by address as the user types, debounced", async () => {
    const participants = [
      buildParticipant({ address: "GALP2...Z91Q" }),
      buildParticipant({ address: "GC7RB...1KYV" }),
    ];

    const user = userEvent.setup();
    render(<ParticipantList participants={participants} />);

    const search = screen.getByLabelText(/search participants/i);
    await user.type(search, "GALP2");

    await screen.findByText("GALP2...Z91Q");
    await waitFor(() =>
      expect(screen.queryByText("GC7RB...1KYV")).not.toBeInTheDocument(),
    );
    expect(screen.getAllByTestId("participant-row")).toHaveLength(1);
  });

  it("search is case-insensitive", async () => {
    const participants = [buildParticipant({ address: "GALP2...Z91Q" })];

    const user = userEvent.setup();
    render(<ParticipantList participants={participants} />);

    await user.type(screen.getByLabelText(/search participants/i), "galp2");

    await screen.findByText("GALP2...Z91Q");
  });

  it("shows a distinct no-results state when the search matches nothing", async () => {
    const participants = [buildParticipant({ address: "GALP2...Z91Q" })];

    const user = userEvent.setup();
    render(<ParticipantList participants={participants} />);

    await user.type(screen.getByLabelText(/search participants/i), "NOTHING-MATCHES");

    const noResults = await screen.findByTestId("participant-no-results");
    expect(noResults).toHaveTextContent(/No participants match .NOTHING-MATCHES./);
    expect(screen.queryByTestId("participant-row")).not.toBeInTheDocument();
  });

  it("badges the creator, the connected wallet, and an oracle address", () => {
    const participants = [
      buildParticipant({ address: "CREATOR-ADDR" }),
      buildParticipant({ address: "YOU-ADDR" }),
      buildParticipant({ address: "ORACLE-ADDR" }),
      buildParticipant({ address: "PLAIN-ADDR" }),
    ];

    render(
      <ParticipantList
        participants={participants}
        creatorAddress="CREATOR-ADDR"
        currentUserAddress="YOU-ADDR"
        oracleAddresses={["ORACLE-ADDR"]}
      />,
    );

    const rows = screen.getAllByTestId("participant-row");
    const creatorRow = rows.find((row) => row.textContent?.includes("CREATOR-ADDR"));
    const youRow = rows.find((row) => row.textContent?.includes("YOU-ADDR"));
    const oracleRow = rows.find((row) => row.textContent?.includes("ORACLE-ADDR"));
    const plainRow = rows.find((row) => row.textContent?.includes("PLAIN-ADDR"));

    expect(creatorRow).toHaveTextContent("Creator");
    expect(youRow).toHaveTextContent("You");
    expect(oracleRow).toHaveTextContent("Oracle");

    // No badges leak onto a participant with no special role.
    expect(plainRow).not.toHaveTextContent("Creator");
    expect(plainRow).not.toHaveTextContent("You");
    expect(plainRow).not.toHaveTextContent("Oracle");
  });

  it("badges a participant who is both the creator and the connected wallet with both labels", () => {
    const participants = [buildParticipant({ address: "SELF-CREATOR" })];

    render(
      <ParticipantList
        participants={participants}
        creatorAddress="SELF-CREATOR"
        currentUserAddress="SELF-CREATOR"
      />,
    );

    const row = screen.getByTestId("participant-row");
    expect(row).toHaveTextContent("Creator");
    expect(row).toHaveTextContent("You");
  });

  it("virtualizes long participant lists instead of rendering every row upfront", () => {
    const participants = Array.from({ length: 120 }, (_, i) =>
      buildParticipant({ address: `GADDR-${String(i).padStart(4, "0")}` }),
    );

    render(<ParticipantList participants={participants} />);

    expect(
      screen.getByTestId("participant-virtualized-viewport"),
    ).toBeInTheDocument();
    // Fewer DOM rows than total participants confirms windowing is active.
    expect(screen.getAllByTestId("participant-row").length).toBeLessThan(120);
    // The first participant is still visible without scrolling.
    expect(screen.getByText("GADDR-0000")).toBeInTheDocument();
  });

  it("does not virtualize short lists", () => {
    const participants = Array.from({ length: 5 }, (_, i) =>
      buildParticipant({ address: `GADDR-${i}` }),
    );

    render(<ParticipantList participants={participants} />);

    expect(
      screen.queryByTestId("participant-virtualized-viewport"),
    ).not.toBeInTheDocument();
    expect(screen.getAllByTestId("participant-row")).toHaveLength(5);
  });
});
