/**
 * Tests for the events page date-range filter.
 *
 * Covers:
 *  1. A date range filters the events.
 *  2. The range is reflected in the URL.
 *  3. A range with no events shows the empty state.
 */

import type { ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import EventsPage from "./page";

const mockReplace = vi.fn();
let mockSearch = "";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: mockReplace }),
  useSearchParams: () => new URLSearchParams(mockSearch),
}));

vi.mock("@/component/Header", () => ({
  default: () => <div data-testid="header" />,
}));

vi.mock("@/component/Footer", () => ({
  default: () => <div data-testid="footer" />,
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const CHAMPIONSHIP = "Stellar Prediction Championship — Season 1";
const INVITATIONAL = "Crypto Oracle Invitational — Q3 2026";

function lastReplacedParams(): URLSearchParams {
  const lastCall = mockReplace.mock.calls[mockReplace.mock.calls.length - 1];
  return new URLSearchParams(String(lastCall?.[0] ?? "").replace(/^\?/, ""));
}

function setRange(from: string, to: string) {
  fireEvent.change(screen.getByLabelText("Filter events from date"), {
    target: { value: from },
  });
  fireEvent.change(screen.getByLabelText("Filter events to date"), {
    target: { value: to },
  });
}

describe("EventsPage date-range filter", () => {
  beforeEach(() => {
    mockReplace.mockClear();
    mockSearch = "";
  });

  it("shows all events when no range is set", () => {
    render(<EventsPage />);

    expect(screen.getAllByTestId("event-card")).toHaveLength(2);
    expect(screen.getByText(CHAMPIONSHIP)).toBeInTheDocument();
    expect(screen.getByText(INVITATIONAL)).toBeInTheDocument();
  });

  it("filters the events by the selected date range", () => {
    render(<EventsPage />);

    setRange("2026-08-01", "2026-08-31");

    expect(screen.getAllByTestId("event-card")).toHaveLength(1);
    expect(screen.getByText(INVITATIONAL)).toBeInTheDocument();
    expect(screen.queryByText(CHAMPIONSHIP)).not.toBeInTheDocument();
  });

  it("reflects the range in the URL", () => {
    render(<EventsPage />);

    setRange("2026-08-01", "2026-08-31");

    const params = lastReplacedParams();
    expect(params.get("from")).toBe("2026-08-01");
    expect(params.get("to")).toBe("2026-08-31");
  });

  it("restores the range from the URL", () => {
    mockSearch = "from=2026-07-15&to=2026-07-20";
    render(<EventsPage />);

    expect(screen.getByLabelText("Filter events from date")).toHaveValue(
      "2026-07-15",
    );
    expect(screen.getByLabelText("Filter events to date")).toHaveValue(
      "2026-07-20",
    );
    expect(screen.getAllByTestId("event-card")).toHaveLength(1);
    expect(screen.getByText(INVITATIONAL)).toBeInTheDocument();
  });

  it("shows the empty state when no events fall in the range", () => {
    render(<EventsPage />);

    setRange("2027-01-01", "2027-01-31");

    expect(screen.queryAllByTestId("event-card")).toHaveLength(0);
    expect(screen.getByText("No events in this date range")).toBeInTheDocument();
  });

  it("clears the range and the URL params", () => {
    render(<EventsPage />);

    setRange("2027-01-01", "2027-01-31");
    fireEvent.click(screen.getByRole("button", { name: "Clear date range" }));

    expect(screen.getAllByTestId("event-card")).toHaveLength(2);
    const params = lastReplacedParams();
    expect(params.get("from")).toBeNull();
    expect(params.get("to")).toBeNull();
  });
});
