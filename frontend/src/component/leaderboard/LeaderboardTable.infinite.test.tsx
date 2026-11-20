import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, waitFor } from "@testing-library/react";
import LeaderboardTable, { type LeaderboardEntry } from "./LeaderboardTable";

// Mock @tanstack/react-virtual
vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: () => ({
    getVirtualItems: () => Array.from({ length: 20 }, (_, i) => ({
      key: i,
      index: i,
      start: i * 60,
      size: 60,
    })),
    getTotalSize: () => 1200,
  }),
}));

describe("LeaderboardTable - Infinite Scrolling", () => {
  const generateEntries = (count: number, offset = 0): LeaderboardEntry[] =>
    Array.from({ length: count }, (_, i) => ({
      rank: offset + i + 1,
      username: `User${offset + i + 1}`,
      stellar_address: `GTEST${offset + i + 1}`,
      points: 1000 - (offset + i) * 10,
      winRate: 80 - (offset + i),
      predictions: 10 + offset + i,
    }));

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls onLoadMore when scrolling near bottom", async () => {
    const mockLoadMore = vi.fn();
    const initialEntries = generateEntries(50);

    const { container } = render(
      <LeaderboardTable
        entries={initialEntries}
        onLoadMore={mockLoadMore}
        hasMore={true}
      />
    );

    const scrollContainer = container.querySelector('[style*="height: 600px"]');
    expect(scrollContainer).toBeInTheDocument();

    if (scrollContainer) {
      // Simulate scroll near bottom
      Object.defineProperty(scrollContainer, 'scrollTop', { value: 500, writable: true });
      Object.defineProperty(scrollContainer, 'scrollHeight', { value: 1200, writable: true });
      Object.defineProperty(scrollContainer, 'clientHeight', { value: 600, writable: true });

      fireEvent.scroll(scrollContainer);

      await waitFor(() => {
        expect(mockLoadMore).toHaveBeenCalled();
      });
    }
  });

  it("does not call onLoadMore when hasMore is false", async () => {
    const mockLoadMore = vi.fn();
    const initialEntries = generateEntries(50);

    const { container } = render(
      <LeaderboardTable
        entries={initialEntries}
        onLoadMore={mockLoadMore}
        hasMore={false}
      />
    );

    const scrollContainer = container.querySelector('[style*="height: 600px"]');

    if (scrollContainer) {
      Object.defineProperty(scrollContainer, 'scrollTop', { value: 500, writable: true });
      Object.defineProperty(scrollContainer, 'scrollHeight', { value: 1200, writable: true });
      Object.defineProperty(scrollContainer, 'clientHeight', { value: 600, writable: true });

      fireEvent.scroll(scrollContainer);

      await waitFor(() => {
        expect(mockLoadMore).not.toHaveBeenCalled();
      });
    }
  });

  it("prevents duplicate loading when isLoadingMore is true", async () => {
    const mockLoadMore = vi.fn();
    const initialEntries = generateEntries(50);

    const { container } = render(
      <LeaderboardTable
        entries={initialEntries}
        onLoadMore={mockLoadMore}
        hasMore={true}
        isLoadingMore={true}
      />
    );

    const scrollContainer = container.querySelector('[style*="height: 600px"]');

    if (scrollContainer) {
      Object.defineProperty(scrollContainer, 'scrollTop', { value: 500, writable: true });
      Object.defineProperty(scrollContainer, 'scrollHeight', { value: 1200, writable: true });
      Object.defineProperty(scrollContainer, 'clientHeight', { value: 600, writable: true });

      fireEvent.scroll(scrollContainer);

      await waitFor(() => {
        expect(mockLoadMore).not.toHaveBeenCalled();
      });
    }
  });
});
