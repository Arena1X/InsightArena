/**
 * Tests for the markets list category filter chips.
 *
 * Covers:
 *  1. Selecting a chip filters the list.
 *  2. Multiple chips combine (a market in any selected category is shown).
 *  3. Clear resets the filter and the URL.
 */

import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import MarketsPage from "./page";

const mockPush = vi.fn();
let mockSearch = "";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(mockSearch),
}));

const mockMarkets = [
  { id: "1", title: "Bitcoin above $100k?", category: "Crypto", probability: 0.6, totalStaked: 100, closeAt: "2099-01-01T00:00:00Z", status: "active" },
  { id: "2", title: "Champions League winner", category: "Sports", probability: 0.4, totalStaked: 50, closeAt: "2099-01-01T00:00:00Z", status: "active" },
  { id: "3", title: "Fed rate cut in March?", category: "Finance", probability: 0.3, totalStaked: 75, closeAt: "2099-01-01T00:00:00Z", status: "active" },
];

vi.mock("@/lib/api", () => ({
  apiClient: { get: vi.fn(async () => mockMarkets) },
  ApiError: class ApiError extends Error {},
  sortMarkets: <T,>(items: T[]) => items,
  isEndingSoon: () => false,
  MARKET_SORT_OPTIONS: [],
}));

vi.mock("@/context/FavoritesContext", () => ({
  useFavorites: () => ({
    favoriteIds: new Set<string>(),
    toggleFavorite: vi.fn(),
    isLoading: false,
  }),
}));

vi.mock("@/context/PredictionSlipContext", () => ({
  usePredictionSlip: () => ({ addItem: vi.fn(), openSlip: vi.fn() }),
}));

vi.mock("@/hooks/useInfiniteScroll", () => ({
  useInfiniteScroll: () => ({
    observerTarget: { current: null },
    isLoading: false,
    loadMore: vi.fn(),
    announcement: "",
  }),
}));

vi.mock("@/component/MarketCard", () => ({
  default: ({ market }: { market: { title: string } }) => (
    <div data-testid="market-card">{market.title}</div>
  ),
}));

vi.mock("@/component/loading-route-skeletons", () => ({
  MarketsPageLoadingSkeleton: () => <div data-testid="markets-loading" />,
}));

function lastPushedCategory(): string | null {
  const lastCall = mockPush.mock.calls[mockPush.mock.calls.length - 1];
  const url = String(lastCall?.[0] ?? "");
  return new URLSearchParams(url.replace(/^\?/, "")).get("category");
}

function chip(name: string) {
  const group = screen.getByRole("group", { name: /filter by category/i });
  return within(group).getByRole("button", { name: new RegExp(`^${name}`) });
}

function visibleTitles() {
  return screen.getAllByTestId("market-card").map((card) => card.textContent);
}

describe("MarketsPage category chips", () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockSearch = "";
    sessionStorage.clear();
  });

  it("filters the list when a chip is selected", async () => {
    render(<MarketsPage />);
    await screen.findByText("Bitcoin above $100k?");
    expect(visibleTitles()).toHaveLength(3);

    fireEvent.click(chip("Crypto"));

    expect(chip("Crypto")).toHaveAttribute("aria-pressed", "true");
    expect(visibleTitles()).toEqual(["Bitcoin above $100k?"]);
    expect(lastPushedCategory()).toBe("Crypto");
  });

  it("combines multiple selected chips", async () => {
    render(<MarketsPage />);
    await screen.findByText("Bitcoin above $100k?");

    fireEvent.click(chip("Crypto"));
    fireEvent.click(chip("Sports"));

    expect(visibleTitles()).toEqual([
      "Bitcoin above $100k?",
      "Champions League winner",
    ]);
    expect(screen.queryByText("Fed rate cut in March?")).not.toBeInTheDocument();
    expect(lastPushedCategory()).toBe("Sports,Crypto");

    // Toggling a selected chip off removes only that category.
    fireEvent.click(chip("Crypto"));
    expect(visibleTitles()).toEqual(["Champions League winner"]);
    expect(lastPushedCategory()).toBe("Sports");
  });

  it("restores multi-select state from the URL", async () => {
    mockSearch = "category=Finance,Sports";
    render(<MarketsPage />);
    await screen.findByText("Champions League winner");

    expect(chip("Finance")).toHaveAttribute("aria-pressed", "true");
    expect(chip("Sports")).toHaveAttribute("aria-pressed", "true");
    expect(visibleTitles()).toEqual([
      "Champions League winner",
      "Fed rate cut in March?",
    ]);
  });

  it("clears the filter and the URL when clear is clicked", async () => {
    render(<MarketsPage />);
    await screen.findByText("Bitcoin above $100k?");

    fireEvent.click(chip("Crypto"));
    fireEvent.click(chip("Finance"));
    expect(visibleTitles()).toHaveLength(2);

    fireEvent.click(
      screen.getByRole("button", { name: /clear category filters/i }),
    );

    expect(visibleTitles()).toHaveLength(3);
    expect(chip("Crypto")).toHaveAttribute("aria-pressed", "false");
    expect(chip("Finance")).toHaveAttribute("aria-pressed", "false");
    expect(lastPushedCategory()).toBeNull();
    expect(
      screen.queryByRole("button", { name: /clear category filters/i }),
    ).not.toBeInTheDocument();
  });
});
