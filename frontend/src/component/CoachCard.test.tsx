import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CoachCard from "./CoachCard";
import { useCoachInsights } from "@/hooks/useCoachInsights";
import { useWallet } from "@/context/WalletContext";
import type { CoachInsightsResponse } from "@/lib/coach";

vi.mock("@/context/WalletContext", () => ({
  useWallet: vi.fn(),
}));

vi.mock("@/hooks/useCoachInsights", () => ({
  useCoachInsights: vi.fn(),
}));

const mockedUseWallet = vi.mocked(useWallet);
const mockedUseCoachInsights = vi.mocked(useCoachInsights);

function buildHistoryResponse(
  overrides: Partial<CoachInsightsResponse> = {},
): CoachInsightsResponse {
  return {
    has_history: true,
    message: null,
    insights: {
      accuracy_trend: {
        direction: "improving",
        recent_accuracy: 80,
        prior_accuracy: 50,
      },
      best_category: {
        category: "Crypto",
        predictions: 10,
        correct: 8,
        accuracy_rate: "80.0",
      },
      worst_category: {
        category: "Sports",
        predictions: 5,
        correct: 2,
        accuracy_rate: "40.0",
      },
      current_streak: 3,
      longest_streak: 6,
      total_resolved: 15,
      generated_at: "2026-08-19T10:00:00Z",
    },
    ...overrides,
  };
}

describe("CoachCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedUseWallet.mockReturnValue({
      address: "GADDRESS",
      openConnectModal: vi.fn(),
    } as unknown as ReturnType<typeof useWallet>);
  });

  it("renders the tailored insight with a derived CTA when the user has history", () => {
    mockedUseCoachInsights.mockReturnValue({
      insights: buildHistoryResponse(),
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      hasHistory: true,
    });

    render(<CoachCard />);

    expect(screen.getByText("Improving")).toBeInTheDocument();
    expect(screen.getByTestId("coach-trend")).toHaveTextContent("80% vs 50%");
    expect(screen.getByText("Strongest category")).toBeInTheDocument();
    expect(screen.getByTestId("coach-streak")).toHaveTextContent(/3/);
    expect(screen.getByTestId("coach-streak")).toHaveTextContent("best 6");

    // CTA derived from the actual best category, not hardcoded copy.
    const cta = screen.getByTestId("coach-insight-cta");
    expect(cta).toHaveTextContent(
      "Predict more in Crypto — your strongest category",
    );
    expect(cta).toHaveAttribute("href", "/markets");
  });

  it("falls back to a trend-based CTA when no category qualifies", () => {
    const response = buildHistoryResponse();
    response.insights!.best_category = null;
    response.insights!.worst_category = null;
    mockedUseCoachInsights.mockReturnValue({
      insights: response,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      hasHistory: true,
    });

    render(<CoachCard />);

    const cta = screen.getByTestId("coach-insight-cta");
    expect(cta).toHaveTextContent(
      "You're trending up — keep making predictions",
    );
  });

  it("renders the onboarding state for users below the history threshold", () => {
    mockedUseCoachInsights.mockReturnValue({
      insights: {
        has_history: false,
        message:
          "Make a few more predictions to unlock your personalised coach insights.",
        insights: null,
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      hasHistory: false,
    });

    render(<CoachCard />);

    expect(
      screen.getByText(/Your coach needs more history first/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Make a few more predictions to unlock your personalised coach insights/),
    ).toBeInTheDocument();

    // Onboarding CTA instead of an insight CTA.
    expect(screen.queryByTestId("coach-insight-cta")).not.toBeInTheDocument();
    const cta = screen.getByTestId("coach-onboarding-cta");
    expect(cta).toHaveTextContent("Explore Markets");
    expect(cta).toHaveAttribute("href", "/markets");

    // No trend/streak widgets leak into the empty state.
    expect(screen.queryByTestId("coach-trend")).not.toBeInTheDocument();
    expect(screen.queryByTestId("coach-streak")).not.toBeInTheDocument();
  });

  it("renders a distinct loading skeleton while fetching", () => {
    mockedUseCoachInsights.mockReturnValue({
      insights: null,
      isLoading: true,
      error: null,
      refetch: vi.fn(),
      hasHistory: false,
    });

    render(<CoachCard />);

    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText("Loading coach insights…")).toBeInTheDocument();

    // Neither the empty state nor an error shows during loading.
    expect(screen.queryByText(/Your coach needs more history/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("coach-onboarding-cta")).not.toBeInTheDocument();
  });

  it("renders a distinct retryable error state", () => {
    const refetch = vi.fn();
    mockedUseCoachInsights.mockReturnValue({
      insights: null,
      isLoading: false,
      error: "Failed to load coach insights.",
      refetch,
      hasHistory: false,
    });

    render(<CoachCard />);

    expect(screen.getByText("Failed to load coach insights.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();

    // Error is not conflated with the new-user onboarding state.
    expect(screen.queryByTestId("coach-onboarding-cta")).not.toBeInTheDocument();
    expect(screen.queryByText(/Your coach needs more history/)).not.toBeInTheDocument();
  });
});
