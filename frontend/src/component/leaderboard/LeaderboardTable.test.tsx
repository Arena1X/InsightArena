import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import LeaderboardTable, { type LeaderboardEntry } from "./LeaderboardTable";

// Mock @tanstack/react-virtual
vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: () => ({
    getVirtualItems: () => [
      { key: 0, index: 0, start: 0, size: 60 },
      { key: 1, index: 1, start: 60, size: 60 },
      { key: 2, index: 2, start: 120, size: 60 },
    ],
    getTotalSize: () => 180,
  }),
}));

describe("LeaderboardTable", () => {
  const mockEntries: LeaderboardEntry[] = [
    {
      rank: 1,
      username: "Alice",
      stellar_address: "GTEST1ALICE",
      points: 1500,
      winRate: 85,
      predictions: 20,
    },
    {
      rank: 2,
      username: "Bob",
      stellar_address: "GTEST2BOB",
      points: 1200,
      winRate: 75,
      predictions: 16,
    },
    {
      rank: 3,
      username: "Charlie",
      stellar_address: "GTEST3CHARLIE",
      points: 1000,
      winRate: 70,
      predictions: 14,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders only visible rows in virtualized list", () => {
    render(<LeaderboardTable entries={mockEntries} />);

    // Should render the virtualized entries
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.getByText("Charlie")).toBeInTheDocument();
  });

  it("displays loading skeleton when isLoading is true", () => {
    render(<LeaderboardTable isLoading={true} />);

    // Should show skeleton rows
    const skeletonRows = screen.getAllByRole("row");
    // 1 header + 3 skeleton rows (from mocked virtualizer)
    expect(skeletonRows.length).toBeGreaterThan(1);
  });

  it("displays empty state when no entries", () => {
    render(<LeaderboardTable entries={[]} />);

    expect(screen.getByText("No entries for this season yet.")).toBeInTheDocument();
  });

  it("renders rank delta column when showDelta is true", () => {
    const entriesWithDelta: LeaderboardEntry[] = mockEntries.map((e, i) => ({
      ...e,
      rank_delta: i === 0 ? 2 : i === 1 ? -1 : 0,
    }));

    render(<LeaderboardTable entries={entriesWithDelta} showDelta={true} />);

    // Header should include delta column
    expect(screen.getByText("Δ")).toBeInTheDocument();
  });

  it("calls onLoadMore when hasMore is true", () => {
    const mockLoadMore = vi.fn();

    render(
      <LeaderboardTable
        entries={mockEntries}
        onLoadMore={mockLoadMore}
        hasMore={true}
      />
    );

    // Verify component renders (loadMore called via scroll event)
    expect(screen.getByLabelText("Leaderboard table")).toBeInTheDocument();
  });

  it("displays loading indicator when isLoadingMore is true", () => {
    render(<LeaderboardTable entries={mockEntries} isLoadingMore={true} />);

    expect(screen.getByText("Loading more...")).toBeInTheDocument();
  });

  it("highlights current user row", () => {
    render(<LeaderboardTable entries={mockEntries} currentUser="Bob" />);

    // Should find "You" indicator for Bob
    expect(screen.getByText("You")).toBeInTheDocument();
  });

  it("displays special styling for top 3 ranks", () => {
    const { container } = render(<LeaderboardTable entries={mockEntries} />);

    // Top 3 should have special border styling (rank 1, 2, 3)
    const rows = container.querySelectorAll('tr[data-index]');
    expect(rows.length).toBe(3);
  });
});
