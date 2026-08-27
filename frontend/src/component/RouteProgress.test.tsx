import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RouteProgress } from "./RouteProgress";
import { beginRouteContentLoad } from "@/lib/utils";

let mockPathname = "/a";
let mockSearch = "";

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
  useSearchParams: () => new URLSearchParams(mockSearch),
}));

function mockMatchMedia(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({
      matches,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  );
}

function getProgress(): number {
  return Number(screen.getByRole("progressbar").getAttribute("aria-valuenow"));
}

describe("RouteProgress", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockPathname = "/a";
    mockSearch = "";
    mockMatchMedia(false);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("stays hidden until a navigation actually starts", () => {
    render(<RouteProgress />);
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("trickles up but never completes while content is still pending", () => {
    render(<RouteProgress />);

    act(() => {
      window.history.pushState({}, "", "/b");
    });
    act(() => {
      vi.advanceTimersByTime(160); // past SHOW_DELAY_MS
    });

    expect(screen.getByRole("progressbar")).toBeInTheDocument();
    expect(getProgress()).toBeGreaterThan(0);
    expect(getProgress()).toBeLessThan(100);

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(getProgress()).toBeLessThan(100);
  });

  it("does not complete before route content settles on a slow transition", () => {
    const { rerender } = render(<RouteProgress />);

    // Simulate the destination's loading.tsx mounting before its content is ready.
    const release = beginRouteContentLoad();

    act(() => {
      window.history.pushState({}, "", "/b");
    });
    act(() => {
      vi.advanceTimersByTime(160);
    });
    expect(screen.getByRole("progressbar")).toBeInTheDocument();

    // Next commits the URL immediately, even though content is still pending.
    mockPathname = "/b";
    rerender(<RouteProgress />);

    expect(screen.getByRole("progressbar")).toBeInTheDocument();
    expect(getProgress()).toBeLessThan(100);

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(getProgress()).toBeLessThan(100);

    // Content is finally ready.
    act(() => {
      release();
    });
    expect(getProgress()).toBe(100);

    act(() => {
      vi.advanceTimersByTime(250); // past FINISH_HOLD_MS
    });
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("completes immediately on route settle when no content is pending", () => {
    const { rerender } = render(<RouteProgress />);

    act(() => {
      window.history.pushState({}, "", "/b");
    });
    act(() => {
      vi.advanceTimersByTime(160);
    });

    mockPathname = "/b";
    act(() => {
      rerender(<RouteProgress />);
    });

    expect(getProgress()).toBe(100);
  });

  it("resets progress instead of jumping to complete when a new navigation starts mid-flight", () => {
    render(<RouteProgress />);

    act(() => {
      window.history.pushState({}, "", "/b");
    });
    act(() => {
      vi.advanceTimersByTime(160);
    });
    act(() => {
      vi.advanceTimersByTime(500);
    });

    const valueBeforeRenav = getProgress();
    expect(valueBeforeRenav).toBeGreaterThan(0);
    expect(valueBeforeRenav).toBeLessThan(100);

    // A second navigation starts before the first one ever settles.
    act(() => {
      window.history.pushState({}, "", "/c");
    });

    // Reset, not jumped ahead to complete.
    expect(getProgress()).toBe(0);

    act(() => {
      vi.advanceTimersByTime(160);
    });
    expect(getProgress()).toBeGreaterThan(0);
    expect(getProgress()).toBeLessThan(100);
  });

  it("jumps straight to 100% and skips the hold when reduced motion is preferred", () => {
    mockMatchMedia(true);
    render(<RouteProgress />);

    act(() => {
      window.history.pushState({}, "", "/b");
    });
    act(() => {
      vi.advanceTimersByTime(160);
    });

    expect(getProgress()).toBe(100);
  });
});
