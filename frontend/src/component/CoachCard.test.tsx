import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CoachCard from "./CoachCard";
import { useCoachInsights, type UseCoachInsightsReturn } from "@/hooks/useCoachInsights";
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

/** Fills in the lifecycle fields so each test only needs to override what it cares about. */
function buildHookReturn(
  overrides: Partial<UseCoachInsightsReturn>,
): UseCoachInsightsReturn {
  return {
    insights: null,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    hasHistory: false,
    isHidden: false,
    dismiss: vi.fn(),
    snooze: vi.fn(),
    ...overrides,
  };
}

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
    mockedUseCoachInsights.mockReturnValue(
      buildHookReturn({
        insights: buildHistoryResponse(),
        hasHistory: true,
      }),
    );

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
    mockedUseCoachInsights.mockReturnValue(
      buildHookReturn({ insights: response, hasHistory: true }),
    );

    render(<CoachCard />);

    const cta = screen.getByTestId("coach-insight-cta");
    expect(cta).toHaveTextContent(
      "You're trending up — keep making predictions",
    );
  });

  it("renders the onboarding state for users below the history threshold", () => {
    mockedUseCoachInsights.mockReturnValue(
      buildHookReturn({
        insights: {
          has_history: false,
          message:
            "Make a few more predictions to unlock your personalised coach insights.",
          insights: null,
        },
        hasHistory: false,
      }),
    );

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
    mockedUseCoachInsights.mockReturnValue(
      buildHookReturn({ insights: null, isLoading: true, hasHistory: false }),
    );

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
    mockedUseCoachInsights.mockReturnValue(
      buildHookReturn({
        insights: null,
        error: "Failed to load coach insights.",
        refetch,
        hasHistory: false,
      }),
    );

    render(<CoachCard />);

    expect(screen.getByText("Failed to load coach insights.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();

    // Error is not conflated with the new-user onboarding state.
    expect(screen.queryByTestId("coach-onboarding-cta")).not.toBeInTheDocument();
    expect(screen.queryByText(/Your coach needs more history/)).not.toBeInTheDocument();
  });

  it("calls dismiss() when the Dismiss control is clicked", async () => {
    const dismiss = vi.fn();
    mockedUseCoachInsights.mockReturnValue(
      buildHookReturn({
        insights: buildHistoryResponse(),
        hasHistory: true,
        dismiss,
      }),
    );

    const user = userEvent.setup();
    render(<CoachCard />);

    await user.click(screen.getByTestId("coach-dismiss"));
    expect(dismiss).toHaveBeenCalledTimes(1);
  });

  it("calls snooze() when the Snooze control is clicked", async () => {
    const snooze = vi.fn();
    mockedUseCoachInsights.mockReturnValue(
      buildHookReturn({
        insights: buildHistoryResponse(),
        hasHistory: true,
        snooze,
      }),
    );

    const user = userEvent.setup();
    render(<CoachCard />);

    await user.click(screen.getByTestId("coach-snooze"));
    expect(snooze).toHaveBeenCalledTimes(1);
  });

  it("renders the empty state instead of the insight once dismissed/snoozed", () => {
    mockedUseCoachInsights.mockReturnValue(
      buildHookReturn({
        insights: buildHistoryResponse(),
        hasHistory: true,
        isHidden: true,
      }),
    );

    render(<CoachCard />);

    expect(screen.getByTestId("coach-empty-state")).toBeInTheDocument();
    expect(screen.getByText("No active insights")).toBeInTheDocument();

    // The dismissed insight's content must not leak through.
    expect(screen.queryByTestId("coach-trend")).not.toBeInTheDocument();
    expect(screen.queryByTestId("coach-streak")).not.toBeInTheDocument();
    expect(screen.queryByTestId("coach-insight-cta")).not.toBeInTheDocument();
    expect(screen.queryByTestId("coach-dismiss")).not.toBeInTheDocument();
    expect(screen.queryByTestId("coach-snooze")).not.toBeInTheDocument();
  });
});
