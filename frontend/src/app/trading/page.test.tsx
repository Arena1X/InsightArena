import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import TradingPage from "./page";

// Mock Next.js Image component
vi.mock("next/image", () => ({
  default: ({ src, alt, ...props }: any) => {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} {...props} />;
  },
}));

// Mock the components that aren't the focus of this test
vi.mock("@/component/Header", () => ({
  default: () => <div data-testid="mock-header">Header</div>,
}));

vi.mock("@/component/Footer", () => ({
  default: () => <div data-testid="mock-footer">Footer</div>,
}));

vi.mock("@/component/PageBackground", () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="mock-page-background">{children}</div>
  ),
}));

// Mock the markets cache
vi.mock("@/lib/marketsCache", () => ({
  cacheMarkets: vi.fn(),
  getCachedMarkets: vi.fn(() => []),
}));

describe("TradingPage - Keyboard Shortcuts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock window.alert
    global.alert = vi.fn();
  });

  it("should show keyboard shortcuts help overlay when ? is pressed", async () => {
    render(<TradingPage />);

    // Initially help overlay should not be visible
    expect(screen.queryByTestId("keyboard-shortcuts-overlay")).not.toBeInTheDocument();

    // Press ? key
    fireEvent.keyDown(window, { key: "?", bubbles: true });

    // Help overlay should now be visible
    await waitFor(() => {
      expect(screen.getByTestId("keyboard-shortcuts-overlay")).toBeInTheDocument();
    });

    expect(screen.getByText("Keyboard Shortcuts")).toBeInTheDocument();
  });

  it("should list all available shortcuts in help overlay", async () => {
    render(<TradingPage />);

    // Open help
    fireEvent.keyDown(window, { key: "?", bubbles: true });

    await waitFor(() => {
      expect(screen.getByText("Focus search")).toBeInTheDocument();
    });

    expect(screen.getByText("Switch to Live Market tab")).toBeInTheDocument();
    expect(screen.getByText("Switch to Tournament tab")).toBeInTheDocument();
    expect(screen.getByText("Switch to Portfolio tab")).toBeInTheDocument();
    expect(screen.getByText("Switch to Leaderboards tab")).toBeInTheDocument();
    expect(screen.getByText("Trade first visible market")).toBeInTheDocument();
    expect(screen.getByText("Toggle favorite on first market")).toBeInTheDocument();
  });

  it("should focus search input when f key is pressed outside input", async () => {
    render(<TradingPage />);

    const searchInput = screen.getByLabelText("Search tokens");
    expect(searchInput).not.toHaveFocus();

    // Press f key
    fireEvent.keyDown(window, { key: "f", bubbles: true });

    await waitFor(() => {
      expect(searchInput).toHaveFocus();
    });
  });

  it("should switch tabs using number keys", async () => {
    render(<TradingPage />);

    // Initially on Live market tab
    const liveMarketTab = screen.getByRole("button", { name: /Live market/i });
    expect(liveMarketTab).toHaveClass("bg-[#090808]");

    // Press 2 to switch to Tournament
    fireEvent.keyDown(window, { key: "2", bubbles: true });

    await waitFor(() => {
      const tournamentTab = screen.getByRole("button", { name: /Tournament/i });
      expect(tournamentTab).toHaveClass("bg-[#090808]");
    });

    // Press 3 to switch to Portfolio
    fireEvent.keyDown(window, { key: "3", bubbles: true });

    await waitFor(() => {
      const portfolioTab = screen.getByRole("button", { name: /Portfolio/i });
      expect(portfolioTab).toHaveClass("bg-[#090808]");
    });

    // Press 4 to switch to Leaderboards
    fireEvent.keyDown(window, { key: "4", bubbles: true });

    await waitFor(() => {
      const leaderboardsTab = screen.getByRole("button", { name: /Leaderboards/i });
      expect(leaderboardsTab).toHaveClass("bg-[#090808]");
    });

    // Press 1 to switch back to Live market
    fireEvent.keyDown(window, { key: "1", bubbles: true });

    await waitFor(() => {
      expect(liveMarketTab).toHaveClass("bg-[#090808]");
    });
  });

  it("should trigger trade action for first market when t is pressed", async () => {
    render(<TradingPage />);

    fireEvent.keyDown(window, { key: "t", bubbles: true });

    await waitFor(() => {
      expect(global.alert).toHaveBeenCalledWith("Trade clicked for Bitcoin");
    });
  });

  it("should toggle favorite on first market when s is pressed", async () => {
    render(<TradingPage />);

    // Get the star button for Bitcoin (first market)
    const starButtons = screen.getAllByRole("button", {
      name: /Add Bitcoin to favorites/i,
    });
    const firstStarButton = starButtons[0];

    expect(firstStarButton).toBeInTheDocument();

    // Press s to toggle favorite
    fireEvent.keyDown(window, { key: "s", bubbles: true });

    await waitFor(() => {
      const updatedButton = screen.getByRole("button", {
        name: /Remove Bitcoin from favorites/i,
      });
      expect(updatedButton).toBeInTheDocument();
    });
  });

  it("should close help overlay and clear search when Escape is pressed", async () => {
    render(<TradingPage />);

    // Open help overlay
    fireEvent.keyDown(window, { key: "?", bubbles: true });

    await waitFor(() => {
      expect(screen.getByTestId("keyboard-shortcuts-overlay")).toBeInTheDocument();
    });

    // Type in search
    const searchInput = screen.getByLabelText("Search tokens");
    fireEvent.change(searchInput, { target: { value: "Bitcoin" } });
    expect(searchInput).toHaveValue("Bitcoin");

    // Press Escape
    fireEvent.keyDown(window, { key: "Escape", bubbles: true });

    await waitFor(() => {
      expect(screen.queryByTestId("keyboard-shortcuts-overlay")).not.toBeInTheDocument();
    });

    expect(searchInput).toHaveValue("");
  });

  it("should suppress shortcuts while typing in search input", async () => {
    render(<TradingPage />);

    const searchInput = screen.getByLabelText("Search tokens");
    searchInput.focus();

    // Type 't' in the search field - should not trigger trade action
    fireEvent.keyDown(searchInput, { key: "t", bubbles: true });
    fireEvent.change(searchInput, { target: { value: "t" } });

    // Alert should not have been called
    expect(global.alert).not.toHaveBeenCalled();

    // The character should appear in the input
    expect(searchInput).toHaveValue("t");
  });

  it("should suppress tab switching shortcuts while typing in search", async () => {
    render(<TradingPage />);

    const searchInput = screen.getByLabelText("Search tokens");
    searchInput.focus();

    // Get initial active tab
    const liveMarketTab = screen.getByRole("button", { name: /Live market/i });
    expect(liveMarketTab).toHaveClass("bg-[#090808]");

    // Type '2' in the search field - should not switch tabs
    fireEvent.keyDown(searchInput, { key: "2", bubbles: true });
    fireEvent.change(searchInput, { target: { value: "2" } });

    // Tab should not have changed
    expect(liveMarketTab).toHaveClass("bg-[#090808]");

    // The character should appear in the input
    expect(searchInput).toHaveValue("2");
  });

  it("should suppress help overlay toggle while typing in search", async () => {
    render(<TradingPage />);

    const searchInput = screen.getByLabelText("Search tokens");
    searchInput.focus();

    // Type '?' in the search field - should not open help
    fireEvent.keyDown(searchInput, { key: "?", bubbles: true });
    fireEvent.change(searchInput, { target: { value: "?" } });

    // Help overlay should not appear
    expect(screen.queryByTestId("keyboard-shortcuts-overlay")).not.toBeInTheDocument();

    // The character should appear in the input
    expect(searchInput).toHaveValue("?");
  });

  it("should not trigger trade or favorite shortcuts when offline", async () => {
    // Mock navigator.onLine to be false before rendering
    const originalOnLine = Object.getOwnPropertyDescriptor(
      Navigator.prototype,
      "onLine"
    );

    Object.defineProperty(Navigator.prototype, "onLine", {
      configurable: true,
      get: () => false,
    });

    render(<TradingPage />);

    // Simulate offline event
    fireEvent(window, new Event("offline"));

    // Wait a bit for state to update
    await new Promise(resolve => setTimeout(resolve, 100));

    // Try to trade
    fireEvent.keyDown(window, { key: "t", bubbles: true });
    
    // Alert should not be called when offline
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(global.alert).not.toHaveBeenCalled();

    // Try to favorite
    fireEvent.keyDown(window, { key: "s", bubbles: true });
    
    await new Promise(resolve => setTimeout(resolve, 100));

    // Verify the favorite state hasn't changed by checking that Bitcoin is still not favorited
    const starButton = screen.queryByRole("button", {
      name: /Remove Bitcoin from favorites/i,
    });
    expect(starButton).not.toBeInTheDocument();

    // Restore original property descriptor
    if (originalOnLine) {
      Object.defineProperty(Navigator.prototype, "onLine", originalOnLine);
    }
  });

  it("should filter markets and trade first visible market with shortcuts", async () => {
    render(<TradingPage />);

    const searchInput = screen.getByLabelText("Search tokens");

    // Filter to show only Ethereum
    fireEvent.change(searchInput, { target: { value: "Ethereum" } });

    // Wait for the filter to apply
    await waitFor(() => {
      expect(searchInput).toHaveValue("Ethereum");
    });

    // Clear focus by clicking on a non-input element
    const heading = screen.getByText("Crypto Trading Hub");
    fireEvent.click(heading);

    // Press t to trade first visible market (which should now be Ethereum)
    fireEvent.keyDown(document.body, { key: "t", bubbles: true });

    await waitFor(() => {
      expect(global.alert).toHaveBeenCalledWith("Trade clicked for Ethereum");
    });
  });
});
