/**
 * Tests for Keyboard shortcuts for the oracle dashboard — Issue #2159
 *
 * Covers:
 *  1. A shortcut triggers its action when the dashboard is focused (approve, reject, next).
 *  2. Shortcuts are disabled while typing in inputs and avoid browser modifier conflicts.
 *  3. The help overlay lists the shortcuts and closes with Escape.
 */

import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import OracleHomePage from "./page";
import type { PendingQueueItem } from "@/hooks/useOracleDashboard";

const mockApproveSubmission = vi.fn();
const mockRejectSubmission = vi.fn();
const mockSubmitResolution = vi.fn();

const mockQueue: PendingQueueItem[] = [
  {
    marketId: "mkt-101",
    title: "Arsenal vs Chelsea",
    category: "Sports",
    closedAt: "2026-04-01T12:00:00.000Z",
    deadline: "2026-04-01T12:00:00.000Z",
    outcomes: ["Arsenal", "Draw", "Chelsea"],
    participantCount: 64,
    isOverdue: true,
    teamA: "Arsenal",
    teamB: "Chelsea",
  },
  {
    marketId: "mkt-102",
    title: "Lakers vs Celtics",
    category: "Sports",
    closedAt: "2026-04-02T15:00:00.000Z",
    deadline: "2026-04-02T15:00:00.000Z",
    outcomes: ["Lakers", "Celtics"],
    participantCount: 41,
    isOverdue: false,
    teamA: "Lakers",
    teamB: "Celtics",
  },
];

vi.mock("@/hooks/useOracleDashboard", () => ({
  useOracleDashboard: () => ({
    pending: mockQueue,
    queue: mockQueue,
    pendingCount: mockQueue.length,
    overdueCount: 1,
    history: [],
    reliability: {
      successRate: 100,
      totalSubmissions: 0,
      successfulSubmissions: 0,
      failedSubmissions: 0,
      averageSubmissionTimeMs: 0,
    },
    loading: false,
    error: null,
    refresh: vi.fn(),
    submitResolution: mockSubmitResolution,
    approveSubmission: mockApproveSubmission,
    rejectSubmission: mockRejectSubmission,
  }),
}));

vi.mock("@/component/oracle/OracleDashboard", () => ({
  default: () => <div data-testid="oracle-dashboard-stub" />,
}));

describe("OracleHomePage — Keyboard shortcuts (Issue #2159)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApproveSubmission.mockResolvedValue({ txHash: "tx123" });
    mockRejectSubmission.mockResolvedValue(undefined);
    mockSubmitResolution.mockResolvedValue({ txHash: "tx456" });
  });

  it("triggers approve, reject, and next actions when the dashboard is focused", () => {
    render(<OracleHomePage />);

    const dashboard = screen.getByTestId("oracle-dashboard-root");
    dashboard.focus();

    // First row starts selected
    expect(screen.getByTestId("queue-row-mkt-101")).toHaveAttribute(
      "data-selected",
      "true",
    );

    // Press 'n' to advance to next submission
    fireEvent.keyDown(dashboard, { key: "n" });
    expect(screen.getByTestId("queue-row-mkt-102")).toHaveAttribute(
      "data-selected",
      "true",
    );

    // Press 'a' to approve selected submission (mkt-102)
    fireEvent.keyDown(dashboard, { key: "a" });
    expect(mockApproveSubmission).toHaveBeenCalledTimes(1);
    expect(mockApproveSubmission).toHaveBeenCalledWith("mkt-102");

    // Press 'r' to reject selected submission (mkt-102)
    fireEvent.keyDown(dashboard, { key: "r" });
    expect(mockRejectSubmission).toHaveBeenCalledTimes(1);
    expect(mockRejectSubmission).toHaveBeenCalledWith("mkt-102");
  });

  it("disables shortcuts while typing in inputs and avoids browser modifier defaults", () => {
    render(<OracleHomePage />);

    const dashboard = screen.getByTestId("oracle-dashboard-root");
    dashboard.focus();

    // Browser defaults with Ctrl/Meta must not trigger oracle shortcuts
    fireEvent.keyDown(dashboard, { key: "a", ctrlKey: true });
    fireEvent.keyDown(dashboard, { key: "r", metaKey: true });
    expect(mockApproveSubmission).not.toHaveBeenCalled();
    expect(mockRejectSubmission).not.toHaveBeenCalled();

    // Open the submit result form so score inputs are rendered
    fireEvent.click(screen.getAllByRole("button", { name: "Submit result" })[0]);

    const scoreInput = screen.getAllByRole("spinbutton")[0];
    scoreInput.focus();

    // Pressing shortcut keys while focused inside an input must be suppressed
    fireEvent.keyDown(scoreInput, { key: "a", bubbles: true });
    fireEvent.keyDown(scoreInput, { key: "r", bubbles: true });
    fireEvent.keyDown(scoreInput, { key: "n", bubbles: true });
    fireEvent.keyDown(scoreInput, { key: "?", shiftKey: true, bubbles: true });

    expect(mockApproveSubmission).not.toHaveBeenCalled();
    expect(mockRejectSubmission).not.toHaveBeenCalled();
    expect(
      screen.queryByTestId("keyboard-shortcuts-overlay"),
    ).not.toBeInTheDocument();
  });

  it("opens the help overlay listing all shortcuts and closes on Escape", () => {
    render(<OracleHomePage />);

    const dashboard = screen.getByTestId("oracle-dashboard-root");
    dashboard.focus();

    // Open via '?' shortcut (with shiftKey like a real keyboard)
    fireEvent.keyDown(dashboard, { key: "?", shiftKey: true });

    const overlay = screen.getByTestId("keyboard-shortcuts-overlay");
    expect(overlay).toBeInTheDocument();
    expect(within(overlay).getByText("Approve selected submission")).toBeInTheDocument();
    expect(within(overlay).getByText("Reject selected submission")).toBeInTheDocument();
    expect(within(overlay).getByText("Next submission in queue")).toBeInTheDocument();
    expect(within(overlay).getByText("Previous submission in queue")).toBeInTheDocument();
    expect(within(overlay).getByText("Toggle keyboard shortcuts help")).toBeInTheDocument();

    // Close via Escape
    fireEvent.keyDown(dashboard, { key: "Escape" });
    expect(
      screen.queryByTestId("keyboard-shortcuts-overlay"),
    ).not.toBeInTheDocument();
  });
});
