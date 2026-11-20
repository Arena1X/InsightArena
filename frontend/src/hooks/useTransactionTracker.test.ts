import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useTransactionTracker } from "./useTransactionTracker";

describe("useTransactionTracker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("transitions to a distinct timeout state (not failed) when the deadline elapses while still pending", async () => {
    const { result } = renderHook(() => useTransactionTracker());
    const pollFn = vi.fn().mockResolvedValue("pending");

    let id = "";
    act(() => {
      id = result.current.trackTransaction("hash-1", "Test tx", pollFn, 1);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });

    const tx = result.current.transactions.find((t) => t.id === id);
    expect(tx?.status).toBe("timeout");
    expect(tx?.error).toBeUndefined();
  });

  it("confirms normally when the transaction resolves before the timeout", async () => {
    const { result } = renderHook(() => useTransactionTracker());
    const pollFn = vi.fn().mockResolvedValue("confirmed");

    let id = "";
    act(() => {
      id = result.current.trackTransaction("hash-2", "Test tx", pollFn);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });

    const tx = result.current.transactions.find((t) => t.id === id);
    expect(tx?.status).toBe("confirmed");
  });

  it("checkAgain re-arms polling for a timed-out transaction", async () => {
    const { result } = renderHook(() => useTransactionTracker());
    const pollFn = vi
      .fn()
      .mockResolvedValueOnce("pending")
      .mockResolvedValueOnce("confirmed");

    let id = "";
    act(() => {
      id = result.current.trackTransaction("hash-3", "Test tx", pollFn, 1);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    expect(result.current.transactions.find((t) => t.id === id)?.status).toBe(
      "timeout",
    );

    act(() => {
      result.current.checkAgain(id);
    });
    expect(result.current.transactions.find((t) => t.id === id)?.status).toBe(
      "pending",
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    expect(result.current.transactions.find((t) => t.id === id)?.status).toBe(
      "confirmed",
    );
  });
});
