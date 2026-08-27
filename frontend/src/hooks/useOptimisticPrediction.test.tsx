import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PredictionSlipProvider, usePredictionSlip } from "@/context/PredictionSlipContext";
import { ToastProvider } from "@/context/ToastContext";
import { useToast } from "./useToast";
import { useOptimisticPrediction } from "./useOptimisticPrediction";

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <PredictionSlipProvider>{children}</PredictionSlipProvider>
    </ToastProvider>
  );
}

afterEach(() => {
  vi.useRealTimers();
});

describe("useOptimisticPrediction", () => {
  it("adds optimistically, rolls back on chain rejection, and retries with the preserved slip", async () => {
    vi.useFakeTimers();
    const failedPoll = vi.fn().mockResolvedValue("failed" as const);
    const pendingPoll = vi.fn().mockResolvedValue("pending" as const);
    const onSubmit = vi
      .fn()
      .mockResolvedValueOnce({
        id: "prediction-1",
        transaction: { hash: "hash-1", pollFn: failedPoll },
      })
      .mockResolvedValueOnce({
        id: "prediction-2",
        transaction: { hash: "hash-2", pollFn: pendingPoll },
      });

    const { result } = renderHook(
      () => ({
        optimistic: useOptimisticPrediction({ onSubmit }),
        slip: usePredictionSlip(),
        toast: useToast(),
      }),
      { wrapper: Wrapper },
    );

    act(() => {
      result.current.slip.addItem({
        marketId: "market-1",
        marketTitle: "Will it rain?",
        category: "weather",
        outcome: "yes",
        odds: 1.8,
      });
      result.current.slip.updateAmount("market-1", 42);
    });

    await act(async () => {
      await result.current.optimistic.addOptimisticPrediction("market-1", 42, "yes");
    });
    expect(result.current.optimistic.predictions).toEqual([
      expect.objectContaining({ id: "prediction-1", status: "pending", amount: 42 }),
    ]);

    act(() => result.current.slip.clearSlip());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });

    expect(result.current.optimistic.predictions).toEqual([]);
    expect(result.current.optimistic.lastRollback).toEqual(
      expect.objectContaining({ marketId: "market-1", status: "failed", amount: 42 }),
    );
    expect(result.current.slip.items).toEqual([
      expect.objectContaining({ marketId: "market-1", amount: 42, outcome: "yes" }),
    ]);
    expect(result.current.toast.toasts.at(-1)?.action?.label).toBe("Retry");

    await act(async () => {
      result.current.toast.toasts.at(-1)?.action?.onClick();
      await Promise.resolve();
    });

    expect(onSubmit).toHaveBeenCalledTimes(2);
    expect(onSubmit).toHaveBeenLastCalledWith({ marketId: "market-1", amount: 42, direction: "yes" });
    expect(result.current.optimistic.predictions).toEqual([
      expect.objectContaining({ id: "prediction-2", status: "pending", amount: 42 }),
    ]);
    expect(result.current.slip.items).toEqual([
      expect.objectContaining({ marketId: "market-1", amount: 42, outcome: "yes" }),
    ]);
  });
});
