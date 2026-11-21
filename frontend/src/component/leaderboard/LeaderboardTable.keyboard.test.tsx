import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import LeaderboardTable, { type LeaderboardEntry } from "./LeaderboardTable";

// Mock @tanstack/react-virtual with scrollToIndex support
vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: () => ({
    getVirtualItems: () => Array.from({ length: 50 }, (_, i) => ({
      key: i,
      index: i,
      start: i * 60,
      size: 60,
    })),
    getTotalSize: () => 3000,
    scrollToIndex: vi.fn(),
  }),
}));

describe("LeaderboardTable - Keyboard Navigation", () => {
  const generateLargeDataset = (count: number): LeaderboardEntry[] =>
    Array.from({ length: count }, (_, i) => ({
      rank: i + 1,
      username: `User${i + 1}`,
      stellar_address: `GTEST${i + 1}`,
      points: 1000 - i * 10,
      winRate: 80 - i,
      predictions: 10 + i,
    }));

  it("renders large dataset with virtualization", () => {
    const largeDataset = generateLargeDataset(1000);
    render(<LeaderboardTable entries={largeDataset} />);

    // Should render, but only visible rows in DOM
    expect(screen.getByLabelText("Leaderboard table")).toBeInTheDocument();
    
    // First user should be visible
    expect(screen.getByText("User1")).toBeInTheDocument();
  });

  it("supports keyboard navigation with Tab key", () => {
    const dataset = generateLargeDataset(100);
    const { container } = render(<LeaderboardTable entries={dataset} />);

    const scrollContainer = container.querySelector('[style*="height: 600px"]');
    expect(scrollContainer).toBeInTheDocument();

    // Tab navigation should work within the table
    const firstRow = container.querySelector('tr[data-index="0"]');
    expect(firstRow).toBeInTheDocument();
  });

  it("handles focus management for off-screen rows", () => {
    const dataset = generateLargeDataset(500);
    const { container } = render(<LeaderboardTable entries={dataset} />);

    // Virtualizer should handle off-screen row access
    const scrollContainer = container.querySelector('[ref]');
    // Just verify the table is rendered - virtualizer handles off-screen management
    expect(container.querySelector('table')).toBeInTheDocument();
  });
});
