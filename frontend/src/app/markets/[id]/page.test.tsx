import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MarketDetailPage from "./page";
import { apiClient, ApiError } from "@/lib/api";

// Mock navigation hooks
const mockUseParams = vi.fn();
const mockUseRouter = vi.fn();

vi.mock("next/navigation", () => ({
  useParams: () => mockUseParams(),
  useRouter: () => mockUseRouter(),
}));

vi.mock("@/lib/api", () => ({
  apiClient: {
    get: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "ApiError";
    }
  },
}));

vi.mock("@/context/PredictionSlipContext", () => ({
  usePredictionSlip: () => ({
    addItem: vi.fn(),
    openSlip: vi.fn(),
  }),
}));

const mockMarketData = {
  id: "market-123",
  title: "Will Bitcoin reach $100k by 2025?",
  category: "Crypto",
  description: "This market resolves to YES if Bitcoin reaches $100,000 USD by the end of 2025.",
  probability: 0.65,
  totalStaked: 5000,
  closeAt: "2025-12-31T23:59:59Z",
  status: "active",
  volume24h: 1250,
  resolvedAt: null,
};

const mockPriceHistory = [
  { timestamp: "2024-01-01T00:00:00Z", price: 0.5 },
  { timestamp: "2024-01-02T00:00:00Z", price: 0.55 },
  { timestamp: "2024-01-03T00:00:00Z", price: 0.65 },
];

describe("MarketDetailPage", () => {
  let mockApiGet: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockApiGet = apiClient.get as ReturnType<typeof vi.fn>;

    mockUseParams.mockReturnValue({ id: "market-123" });
    mockUseRouter.mockReturnValue({ back: vi.fn() });
    
    mockApiGet.mockClear();
  });

  describe("Loading State", () => {
    it("displays the skeleton loading state while market data is fetching", () => {
      // Make API call hang indefinitely
      mockApiGet.mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );

      render(<MarketDetailPage />);

      // Check for skeleton loading indicator
      expect(
        screen.getByRole("status", { name: "Loading market details" })
      ).toBeInTheDocument();
      
      expect(screen.getByText("Loading market details...")).toBeInTheDocument();
    });

    it("renders skeleton components matching the actual page layout", () => {
      mockApiGet.mockImplementation(() => new Promise(() => {}));

      const { container } = render(<MarketDetailPage />);

      // Verify skeleton structure matches actual layout
      expect(container.querySelector(".rounded-2xl.border")).toBeInTheDocument();
      expect(container.querySelector(".bg-slate-900\\/80")).toBeInTheDocument();
      
      // Stats grid skeleton
      const statsGrid = container.querySelector(".md\\:grid-cols-3");
      expect(statsGrid).toBeInTheDocument();
      
      // Chart skeleton
      const chartSkeleton = container.querySelector(".h-80");
      expect(chartSkeleton).toBeInTheDocument();
    });

    it("does not render actual market content while loading", () => {
      mockApiGet.mockImplementation(() => new Promise(() => {}));

      render(<MarketDetailPage />);

      // Should not show actual market title
      expect(
        screen.queryByText("Will Bitcoin reach $100k by 2025?")
      ).not.toBeInTheDocument();
      
      // Should not show Predict button (only skeleton)
      expect(
        screen.queryByRole("button", { name: /predict/i })
      ).not.toBeInTheDocument();
    });
  });

  describe("Success State", () => {
    beforeEach(() => {
      mockApiGet.mockImplementation((url: string) => {
        if (url.includes("/price-history")) {
          return Promise.resolve(mockPriceHistory);
        }
        return Promise.resolve(mockMarketData);
      });
    });

    it("replaces skeleton with actual market content after successful data load", async () => {
      render(<MarketDetailPage />);

      // Initially shows skeleton
      expect(
        screen.getByRole("status", { name: "Loading market details" })
      ).toBeInTheDocument();

      // Wait for actual content to appear
      await waitFor(() => {
        expect(
          screen.getByText("Will Bitcoin reach $100k by 2025?")
        ).toBeInTheDocument();
      });

      // Skeleton should be gone
      expect(
        screen.queryByRole("status", { name: "Loading market details" })
      ).not.toBeInTheDocument();
    });

    it("displays all market details correctly after loading", async () => {
      render(<MarketDetailPage />);

      await waitFor(() => {
        expect(
          screen.getByText("Will Bitcoin reach $100k by 2025?")
        ).toBeInTheDocument();
      });

      // Check market details
      expect(screen.getByText("Crypto")).toBeInTheDocument();
      expect(screen.getByText("ACTIVE")).toBeInTheDocument();
      expect(screen.getByText("5000.00 XLM staked")).toBeInTheDocument();
      expect(screen.getByText("65%")).toBeInTheDocument();
      expect(screen.getByText("1250 XLM")).toBeInTheDocument();
    });

    it("renders interactive elements after loading completes", async () => {
      render(<MarketDetailPage />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /predict/i })).toBeInTheDocument();
      });

      // Back button should be interactive
      const backButton = screen.getByRole("button", { name: /back/i });
      expect(backButton).toBeInTheDocument();
      expect(backButton).not.toBeDisabled();
    });
  });

  describe("Error State", () => {
    it("displays error message when market data fails to load", async () => {
      mockApiGet.mockRejectedValue(new ApiError("Market not found"));

      render(<MarketDetailPage />);

      // Initially shows skeleton
      expect(
        screen.getByRole("status", { name: "Loading market details" })
      ).toBeInTheDocument();

      // Wait for error state
      await waitFor(() => {
        expect(screen.getByText("Market not found")).toBeInTheDocument();
      });

      // Skeleton should be replaced by error state
      expect(
        screen.queryByRole("status", { name: "Loading market details" })
      ).not.toBeInTheDocument();
    });

    it("displays generic error message for non-API errors", async () => {
      mockApiGet.mockRejectedValue(new Error("Network error"));

      render(<MarketDetailPage />);

      await waitFor(() => {
        expect(screen.getByText("Failed to load market")).toBeInTheDocument();
      });
    });

    it("shows back button in error state", async () => {
      mockApiGet.mockRejectedValue(new ApiError("Not found"));

      render(<MarketDetailPage />);

      await waitFor(() => {
        expect(screen.getByText("Not found")).toBeInTheDocument();
      });

      const backButton = screen.getByRole("button", { name: /back/i });
      expect(backButton).toBeInTheDocument();
    });
  });

  describe("Price History Loading", () => {
    it("shows chart skeleton while price history is loading", async () => {
      let resolvePriceHistory: (value: unknown) => void;
      const priceHistoryPromise = new Promise((resolve) => {
        resolvePriceHistory = resolve;
      });

      mockApiGet.mockImplementation((url: string) => {
        if (url.includes("/price-history")) {
          return priceHistoryPromise;
        }
        return Promise.resolve(mockMarketData);
      });

      const { container } = render(<MarketDetailPage />);

      // Wait for market data to load
      await waitFor(() => {
        expect(
          screen.getByText("Will Bitcoin reach $100k by 2025?")
        ).toBeInTheDocument();
      });

      // Chart skeleton should still be visible
      const chartSkeleton = container.querySelector(".h-80.w-full.rounded-xl");
      expect(chartSkeleton).toBeInTheDocument();

      // Resolve price history
      resolvePriceHistory!(mockPriceHistory);

      // Wait for chart to render
      await waitFor(() => {
        expect(screen.getByText("Price History")).toBeInTheDocument();
      });
    });

    it("displays error state for price history separately from market data", async () => {
      mockApiGet.mockImplementation((url: string) => {
        if (url.includes("/price-history")) {
          return Promise.reject(new ApiError("Failed to load price history"));
        }
        return Promise.resolve(mockMarketData);
      });

      render(<MarketDetailPage />);

      // Market data should load successfully
      await waitFor(() => {
        expect(
          screen.getByText("Will Bitcoin reach $100k by 2025?")
        ).toBeInTheDocument();
      });

      // Price history error should be displayed
      await waitFor(() => {
        expect(
          screen.getByText("Failed to load price history")
        ).toBeInTheDocument();
      });
    });
  });

  describe("Layout Shift Prevention", () => {
    it("maintains consistent container width during loading and content display", async () => {
      mockApiGet.mockImplementation((url: string) => {
        if (url.includes("/price-history")) {
          return Promise.resolve(mockPriceHistory);
        }
        return Promise.resolve(mockMarketData);
      });

      const { container, rerender } = render(<MarketDetailPage />);

      // Get container during loading
      const loadingContainer = container.querySelector(".max-w-4xl");
      expect(loadingContainer).toBeInTheDocument();

      // Wait for content to load
      await waitFor(() => {
        expect(
          screen.getByText("Will Bitcoin reach $100k by 2025?")
        ).toBeInTheDocument();
      });

      // Container should maintain same max-width class
      const contentContainer = container.querySelector(".max-w-4xl");
      expect(contentContainer).toBeInTheDocument();
    });

    it("uses same padding and spacing classes in skeleton and actual content", async () => {
      mockApiGet.mockImplementation((url: string) => {
        if (url.includes("/price-history")) {
          return Promise.resolve(mockPriceHistory);
        }
        return Promise.resolve(mockMarketData);
      });

      const { container } = render(<MarketDetailPage />);

      // Check skeleton padding
      const loadingMain = container.querySelector(".p-6.md\\:p-10");
      expect(loadingMain).toBeInTheDocument();

      await waitFor(() => {
        expect(
          screen.getByText("Will Bitcoin reach $100k by 2025?")
        ).toBeInTheDocument();
      });

      // Content should use same padding
      const contentMain = container.querySelector(".p-6.md\\:p-10");
      expect(contentMain).toBeInTheDocument();
    });
  });

  describe("Accessibility", () => {
    it("provides proper ARIA labels during loading", () => {
      mockApiGet.mockImplementation(() => new Promise(() => {}));

      render(<MarketDetailPage />);

      const loadingStatus = screen.getByRole("status", {
        name: "Loading market details",
      });
      expect(loadingStatus).toBeInTheDocument();
    });

    it("provides screen reader text for loading state", () => {
      mockApiGet.mockImplementation(() => new Promise(() => {}));

      render(<MarketDetailPage />);

      expect(screen.getByText("Loading market details...")).toBeInTheDocument();
    });

    it("does not animate skeletons when motion is reduced", () => {
      mockApiGet.mockImplementation(() => new Promise(() => {}));

      const { container } = render(<MarketDetailPage />);

      const skeletons = container.querySelectorAll("[data-slot='skeleton']");
      expect(skeletons.length).toBeGreaterThan(0);

      skeletons.forEach((skeleton) => {
        expect(skeleton.classList.contains("motion-reduce:animate-none")).toBe(
          true
        );
      });
    });
  });
});
