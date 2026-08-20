import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useOfflineQueue } from "./useOfflineQueue";
import { readQueue } from "@/lib/offlineQueue";

function setNavigatorOnline(value: boolean) {
  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    get: () => value,
  });
}

function fireEvent(name: "online" | "offline") {
  window.dispatchEvent(new Event(name));
}

function goOffline() {
  act(() => {
    setNavigatorOnline(false);
    fireEvent("offline");
  });
}

function goOnline() {
  act(() => {
    setNavigatorOnline(true);
    fireEvent("online");
  });
}

describe("useOfflineQueue", () => {
  beforeEach(() => {
    setNavigatorOnline(true);
    window.localStorage.clear();
  });

  it("enqueues an action and persists it to localStorage", () => {
    const processAction = vi.fn();
    const { result } = renderHook(() => useOfflineQueue({ processAction }));

    act(() => {
      result.current.enqueue("SUBMIT_PREDICTION", { marketId: "m1" });
    });

    expect(result.current.queue).toHaveLength(1);
    expect(result.current.queue[0].type).toBe("SUBMIT_PREDICTION");
    expect(readQueue<{ marketId: string }>()).toHaveLength(1);
    expect(readQueue<{ marketId: string }>()[0].payload).toEqual({
      marketId: "m1",
    });
  });

  it("isolates enqueue failures — failed replay stays queued, success is removed", async () => {
    const processAction = vi
      .fn()
      .mockRejectedValueOnce(new Error("network down"));

    const { result } = renderHook(() => useOfflineQueue({ processAction }));

    goOffline();
    act(() => {
      result.current.enqueue("SUBMIT_PREDICTION", { marketId: "m1" });
      result.current.enqueue("SUBMIT_PREDICTION", { marketId: "m2" });
    });
    expect(result.current.queue).toHaveLength(2);

    goOnline();
    await waitFor(() => expect(result.current.replayPending).toBe(true));

    let results: Awaited<ReturnType<typeof result.current.replay>> = [];
    await act(async () => {
      results = await result.current.replay();
    });

    expect(results).toHaveLength(2);
    const ok = results.filter((r) => r.ok);
    const failed = results.filter((r) => !r.ok);
    expect(ok.map((r) => r.action.payload)).toEqual([{ marketId: "m2" }]);
    expect(failed[0].action.payload).toEqual({ marketId: "m1" });
    expect(result.current.queue).toEqual([failed[0].action]);
    expect(processAction).toHaveBeenCalledTimes(2);
  });

  it("sets replayPending when transitioning offline -> online with queued actions", async () => {
    const processAction = vi.fn();
    const { result } = renderHook(() => useOfflineQueue({ processAction }));

    goOffline();
    act(() => {
      result.current.enqueue("QUEUE_PREDICTION", { marketId: "m1" });
    });

    expect(result.current.replayPending).toBe(false);

    goOnline();
    await waitFor(() => expect(result.current.replayPending).toBe(true));

    // Dismiss should clear the pending flag without replaying.
    act(() => result.current.dismiss());
    expect(result.current.replayPending).toBe(false);
    expect(processAction).not.toHaveBeenCalled();
    expect(result.current.queue).toHaveLength(1);
  });

  it("does not set replayPending if the queue is empty on reconnect", () => {
    const processAction = vi.fn();
    const { result } = renderHook(() => useOfflineQueue({ processAction }));

    goOffline();
    goOnline();

    expect(result.current.replayPending).toBe(false);
  });

  it("discard removes a single queued action", () => {
    const processAction = vi.fn();
    const { result } = renderHook(() => useOfflineQueue({ processAction }));

    let ids: string[] = [];
    act(() => {
      result.current.enqueue("A", {});
      const second = result.current.enqueue("B", {});
      ids = result.current.queue.map((a) => a.id);
      result.current.discard(second.id);
    });

    expect(result.current.queue).toHaveLength(1);
    expect(result.current.queue[0].type).toBe("A");
  });
});