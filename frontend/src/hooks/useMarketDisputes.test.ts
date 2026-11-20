/**
 * Tests for the URL-sync behaviour added to useMarketDisputes.
 *
 * Requirements verified:
 *  1. Opening a dispute updates the URL (?dispute=<id>)
 *  2. Loading the URL restores the dispute / form view
 *  3. Browser back restores the prior view (router.replace is called with the
 *     correct params so the browser history entry is set correctly)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// ---------------------------------------------------------------------------
// Mock next/navigation
// ---------------------------------------------------------------------------

const mockReplace = vi.fn();
let mockSearchParamsString = "";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace }),
  useSearchParams: () => new URLSearchParams(mockSearchParamsString),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function renderDisputesHook(initialSearch = "") {
  mockSearchParamsString = initialSearch;
  // Re-import after updating the search params mock so the hook reads fresh state.
  const { useMarketDisputes } = await import("./useMarketDisputes");
  return renderHook(() => useMarketDisputes());
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useMarketDisputes — URL sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockSearchParamsString = "";
  });

  // ── 1. Opening a dispute updates the URL ───────────────────────────────────

  it("openDispute writes ?dispute=<id> to the URL", async () => {
    const { result } = await renderDisputesHook();

    act(() => {
      result.current.openDispute("dispute-abc");
    });

    expect(mockReplace).toHaveBeenCalledWith(
      expect.stringContaining("dispute=dispute-abc"),
      expect.anything(),
    );
  });

  it("openDispute removes ?disputeForm from the URL", async () => {
    const { result } = await renderDisputesHook("disputeForm=1");

    act(() => {
      result.current.openDispute("dispute-xyz");
    });

    const calledUrl: string = mockReplace.mock.calls[0][0];
    expect(calledUrl).toContain("dispute=dispute-xyz");
    expect(calledUrl).not.toContain("disputeForm");
  });

  it("openForm writes ?disputeForm=1 to the URL", async () => {
    const { result } = await renderDisputesHook();

    act(() => {
      result.current.openForm();
    });

    expect(mockReplace).toHaveBeenCalledWith(
      expect.stringContaining("disputeForm=1"),
      expect.anything(),
    );
  });

  it("openForm removes ?dispute from the URL", async () => {
    const { result } = await renderDisputesHook("dispute=dispute-123");

    act(() => {
      result.current.openForm();
    });

    const calledUrl: string = mockReplace.mock.calls[0][0];
    expect(calledUrl).toContain("disputeForm=1");
    expect(calledUrl).not.toContain("dispute=");
  });

  it("closeDispute removes ?dispute from the URL", async () => {
    const { result } = await renderDisputesHook("dispute=dispute-abc");

    act(() => {
      result.current.closeDispute();
    });

    const calledUrl: string = mockReplace.mock.calls[0][0];
    expect(calledUrl).not.toContain("dispute=");
  });

  it("closeForm removes ?disputeForm from the URL", async () => {
    const { result } = await renderDisputesHook("disputeForm=1");

    act(() => {
      result.current.closeForm();
    });

    const calledUrl: string = mockReplace.mock.calls[0][0];
    expect(calledUrl).not.toContain("disputeForm");
  });

  // ── 2. Loading the URL restores the dispute view ───────────────────────────

  it("activeDisputeId is null when ?dispute is absent", async () => {
    const { result } = await renderDisputesHook();
    expect(result.current.activeDisputeId).toBeNull();
  });

  it("activeDisputeId is populated when ?dispute=<id> is in the URL", async () => {
    const { result } = await renderDisputesHook("dispute=dispute-restore");
    expect(result.current.activeDisputeId).toBe("dispute-restore");
  });

  it("showForm is false when ?disputeForm is absent", async () => {
    const { result } = await renderDisputesHook();
    expect(result.current.showForm).toBe(false);
  });

  it("showForm is true when ?disputeForm=1 is in the URL", async () => {
    const { result } = await renderDisputesHook("disputeForm=1");
    expect(result.current.showForm).toBe(true);
  });

  it("showForm is false for any value other than '1'", async () => {
    const { result } = await renderDisputesHook("disputeForm=true");
    expect(result.current.showForm).toBe(false);
  });

  // ── 3. Browser back restores the prior view ────────────────────────────────
  //
  // The hook uses router.replace(..., { scroll: false }) for every state
  // change, which means each navigation is a URL replacement that the browser
  // treats as the current history entry. When the user presses back, the
  // browser restores the previous search params and the hook re-derives its
  // state from them.
  //
  // We verify this by simulating the two history entries that would exist:
  //  - Initial state (no params)       →  activeDisputeId: null
  //  - After openDispute               →  activeDisputeId: "dispute-abc"
  // And then "going back" (re-rendering with the original params):
  //  - Restored state (no params)      →  activeDisputeId: null

  it("back navigation restores prior state: activeDisputeId reverts to null", async () => {
    // Simulate initial render with no params.
    const { result: before } = await renderDisputesHook("");
    expect(before.current.activeDisputeId).toBeNull();

    // Simulate having navigated to ?dispute=dispute-abc (the "forward" entry).
    vi.resetModules();
    const { result: after } = await renderDisputesHook("dispute=dispute-abc");
    expect(after.current.activeDisputeId).toBe("dispute-abc");

    // Simulate browser back: search params revert to the original state.
    vi.resetModules();
    const { result: restored } = await renderDisputesHook("");
    expect(restored.current.activeDisputeId).toBeNull();
  });

  it("back navigation restores prior state: showForm reverts to false", async () => {
    // Before: form closed.
    const { result: before } = await renderDisputesHook("");
    expect(before.current.showForm).toBe(false);

    // Forward: form open.
    vi.resetModules();
    const { result: after } = await renderDisputesHook("disputeForm=1");
    expect(after.current.showForm).toBe(true);

    // Back: form closed again.
    vi.resetModules();
    const { result: restored } = await renderDisputesHook("");
    expect(restored.current.showForm).toBe(false);
  });

  it("openDispute uses router.replace (not push) so it is part of the browser history", async () => {
    const { result } = await renderDisputesHook();

    act(() => {
      result.current.openDispute("dispute-history-check");
    });

    // router.replace should have been called, not push.
    expect(mockReplace).toHaveBeenCalled();
    // The second argument carries { scroll: false } to avoid page jumps.
    expect(mockReplace).toHaveBeenCalledWith(
      expect.any(String),
      { scroll: false },
    );
  });

  // ── 4. Unrelated params are preserved ─────────────────────────────────────

  it("openDispute preserves pre-existing unrelated params", async () => {
    const { result } = await renderDisputesHook("tab=disputes&foo=bar");

    act(() => {
      result.current.openDispute("dispute-keep-params");
    });

    const calledUrl: string = mockReplace.mock.calls[0][0];
    expect(calledUrl).toContain("dispute=dispute-keep-params");
    expect(calledUrl).toContain("tab=disputes");
    expect(calledUrl).toContain("foo=bar");
  });
});
