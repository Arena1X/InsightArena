import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useLiveOdds } from "./useLiveOdds";

// Mock env
vi.mock("@/lib/env", () => ({
  env: { API_URL: "https://api.example.com" },
}));

const MARKET_ID = "market-123";

interface MockWsInstance {
  events: Record<string, ((...args: unknown[]) => void) | null>;
  close: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
  triggerOpen: () => void;
  triggerMessage: (data: unknown) => void;
  triggerClose: () => void;
}

/**
 * Builds a WebSocket mock that records every created instance, so tests can
 * drive open/message/close on each connection attempt (including reconnects).
 */
function createMockWebSocket() {
  const instances: MockWsInstance[] = [];

  vi.spyOn(globalThis, "WebSocket").mockImplementation(
    ((_url: string) => {
      const instance: MockWsInstance = {
        events: {},
        close: vi.fn(),
        send: vi.fn(),
        triggerOpen() {
          instance.events.open?.();
        },
        triggerMessage(data: unknown) {
          instance.events.message?.(
            new MessageEvent("message", { data: JSON.stringify(data) }),
          );
        },
        triggerClose() {
          instance.events.close?.(new CloseEvent("close"));
        },
      };

      const ws = instance as unknown as WebSocket;
      Object.defineProperty(ws, "readyState", { value: 0, writable: true });
      for (const eventName of ["open", "message", "close", "error"]) {
        Object.defineProperty(ws, `on${eventName}`, {
          set(fn: ((...args: unknown[]) => void) | null) {
            instance.events[eventName] = fn;
          },
          get() {
            return instance.events[eventName];
          },
          configurable: true,
        });
      }
      instances.push(instance);
      return ws;
    }) as unknown as typeof WebSocket,
  );

  return instances;
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useLiveOdds — stale detection", () => {
  it("is not stale once the websocket connects", async () => {
    const instances = createMockWebSocket();
    const { result } = renderHook(() => useLiveOdds(MARKET_ID));

    expect(result.current.status).toBe("connecting");
    expect(result.current.stale).toBe(false);

    act(() => { instances[0].triggerOpen(); });

    await waitFor(() => expect(result.current.status).toBe("connected"));
    expect(result.current.stale).toBe(false);
  });

  it("becomes stale when the websocket disconnects", async () => {
    const instances = createMockWebSocket();
    const { result } = renderHook(() => useLiveOdds(MARKET_ID));

    act(() => { instances[0].triggerOpen(); });
    await waitFor(() => expect(result.current.status).toBe("connected"));

    act(() => { instances[0].triggerClose(); });

    await waitFor(() => {
      expect(result.current.status).toBe("disconnected");
      expect(result.current.stale).toBe(true);
    });
  });

  it("clears staleness when a fresh odds message arrives after reconnect", async () => {
    const instances = createMockWebSocket();
    const { result } = renderHook(() => useLiveOdds(MARKET_ID));

    act(() => { instances[0].triggerOpen(); });
    await waitFor(() => expect(result.current.status).toBe("connected"));

    // Disconnect → stale
    act(() => { instances[0].triggerClose(); });
    await waitFor(() => {
      expect(result.current.status).toBe("disconnected");
      expect(result.current.stale).toBe(true);
    });

    // Advance past the reconnect backoff (500ms) so connect() is called again
    act(() => { vi.advanceTimersByTime(500); });
    expect(instances.length).toBeGreaterThanOrEqual(2);

    // Open the new socket
    act(() => { instances[1].triggerOpen(); });
    await waitFor(() => expect(result.current.status).toBe("connected"));

    // Receive a fresh message → stale cleared
    act(() => {
      instances[1].triggerMessage({
        marketId: MARKET_ID,
        yesOdds: 0.7,
        noOdds: 0.3,
        updatedAt: Date.now(),
      });
    });

    expect(result.current.stale).toBe(false);
  });

  it("flags data as stale when no message arrives within STALE_AFTER_MS", async () => {
    const instances = createMockWebSocket();
    const { result } = renderHook(() => useLiveOdds(MARKET_ID));

    act(() => { instances[0].triggerOpen(); });
    await waitFor(() => expect(result.current.status).toBe("connected"));
    expect(result.current.stale).toBe(false);

    // Advance past the stale threshold (30s)
    act(() => { vi.advanceTimersByTime(31_000); });
    await waitFor(() => expect(result.current.stale).toBe(true));

    // A later message clears the stale flag
    act(() => {
      instances[0].triggerMessage({
        marketId: MARKET_ID,
        yesOdds: 0.55,
        noOdds: 0.45,
        updatedAt: Date.now(),
      });
    });
    expect(result.current.stale).toBe(false);
  });

  it("treats a null marketId as disconnected/stale", () => {
    const { result } = renderHook(() => useLiveOdds(null));
    expect(result.current.status).toBe("disconnected");
    expect(result.current.stale).toBe(true);
  });
});