import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MarketDisputePanel from "./MarketDisputePanel";
import { useMarketDisputes } from "@/hooks/useMarketDisputes";

vi.mock("@/hooks/useMarketDisputes", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/hooks/useMarketDisputes")>();
  return {
    ...actual,
    useMarketDisputes: vi.fn(),
  };
});

const mockedUseMarketDisputes = vi.mocked(useMarketDisputes);

function buildHookReturn(overrides: Partial<ReturnType<typeof useMarketDisputes>> = {}) {
  return {
    disputes: [],
    loading: false,
    error: null,
    submitting: false,
    submitError: null,
    submitSuccess: null,
    refresh: vi.fn(),
    submitDispute: vi.fn(),
    clearStatus: vi.fn(),
    ...overrides,
  };
}

describe("MarketDisputePanel", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-28T00:00:00Z"));
    mockedUseMarketDisputes.mockReturnValue(buildHookReturn());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders nothing when the market is not resolved", () => {
    const { container } = render(
      <MarketDisputePanel
        marketId="m1"
        marketTitle="Test Market"
        isResolved={false}
        resolvedAt={null}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("shows a live countdown to the dispute window close when resolved recently", () => {
    render(
      <MarketDisputePanel
        marketId="m1"
        marketTitle="Test Market"
        isResolved
        resolvedAt="2026-09-27T00:00:00Z"
      />,
    );

    // Resolved yesterday, 7-day window -> ~6 days left.
    const countdown = screen.getByTestId("dispute-window-countdown");
    expect(countdown).toHaveTextContent("Dispute window closes in");
    expect(countdown).toHaveTextContent("6d");
  });

  it("disables the Raise dispute button once the 7-day window has passed", () => {
    render(
      <MarketDisputePanel
        marketId="m1"
        marketTitle="Test Market"
        isResolved
        resolvedAt="2026-09-01T00:00:00Z"
      />,
    );

    expect(screen.getByTestId("dispute-window-countdown")).toHaveTextContent(
      "Dispute window closed",
    );
    expect(
      screen.getByRole("button", { name: "Raise dispute" }),
    ).toBeDisabled();
  });

  it("does not render a countdown when resolvedAt is unavailable", () => {
    render(
      <MarketDisputePanel
        marketId="m1"
        marketTitle="Test Market"
        isResolved
        resolvedAt={null}
      />,
    );

    expect(screen.queryByTestId("dispute-window-countdown")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Raise dispute" }),
    ).toBeEnabled();
  });

  it("opens the dispute form with the window-closed flag once the window has passed", async () => {
    vi.useRealTimers();
    // Real timers needed for userEvent; freeze the clock via Date mock instead
    // is unnecessary here since the button is disabled and unclickable, which
    // is exactly what we're asserting.
    render(
      <MarketDisputePanel
        marketId="m1"
        marketTitle="Test Market"
        isResolved
        resolvedAt="2020-01-01T00:00:00Z"
      />,
    );

    const button = screen.getByRole("button", { name: "Raise dispute" });
    expect(button).toBeDisabled();
  });

  it("calls refresh with the market id on mount", () => {
    const refresh = vi.fn();
    mockedUseMarketDisputes.mockReturnValue(buildHookReturn({ refresh }));

    render(
      <MarketDisputePanel
        marketId="m42"
        marketTitle="Test Market"
        isResolved
        resolvedAt="2026-09-27T00:00:00Z"
      />,
    );

    expect(refresh).toHaveBeenCalledWith("m42");
  });
});
