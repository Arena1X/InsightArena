import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const processQueue = vi.fn(async () => {});
vi.mock("@/lib/actionQueue", () => ({
  queueAction: vi.fn(() => "id"),
  processQueue: () => processQueue(),
}));

import { useOfflineQueue } from "./useOfflineQueue";

describe("useOfflineQueue", () => {
  beforeEach(() => processQueue.mockClear());

  it("replays the queue on reconnect", () => {
    renderHook(() => useOfflineQueue());
    window.dispatchEvent(new Event("online"));
    expect(processQueue).toHaveBeenCalledTimes(1);
  });

  it("stops listening on unmount", () => {
    const { unmount } = renderHook(() => useOfflineQueue());
    unmount();
    window.dispatchEvent(new Event("online"));
    expect(processQueue).not.toHaveBeenCalled();
  });
});
