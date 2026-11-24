import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MAX_RECONNECT_ATTEMPTS, useLiveOdds } from "../useLiveOdds";

type SocketHandler = (...args: unknown[]) => void;

const mockSocketInstances: Array<{
  handlers: Record<string, SocketHandler>;
  on: ReturnType<typeof vi.fn>;
  emit: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  trigger: (event: string, ...args: unknown[]) => void;
}> = [];

vi.mock("socket.io-client", () => ({
  io: vi.fn(() => {
    const handlers: Record<string, SocketHandler> = {};
    const instance = {
      handlers,
      on: vi.fn((event: string, cb: SocketHandler) => {
        handlers[event] = cb;
      }),
      emit: vi.fn(),
      disconnect: vi.fn(),
      trigger: (event: string, ...args: unknown[]) => {
        handlers[event]?.(...args);
      },
    };
    mockSocketInstances.push(instance);
    return instance;
  }),
}));

vi.mock("@/context/WalletContext", () => ({
  useWallet: () => ({ token: "test-token" }),
}));

vi.mock("@/lib/env", () => ({
  env: { API_URL: "http://localhost:4000" },
}));

describe("useLiveOdds retry control", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockSocketInstances.length = 0;
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
    } as Response);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("shows disconnected indicator and error on subscription error", () => {
    const { result } = renderHook(() => useLiveOdds("market-1"));

    expect(mockSocketInstances).toHaveLength(1);
    act(() => {
      mockSocketInstances[0].trigger("connect_error");
    });

    expect(result.current.status).toBe("disconnected");
    expect(result.current.isDisconnected).toBe(true);
    expect(result.current.error).toBe("Live odds connection failed");
    expect(result.current.retryCount).toBe(1);
    expect(result.current.retryExhausted).toBe(false);
  });

  it("bounds auto-retry attempts before exhausting and falling back to polling", async () => {
    const { result } = renderHook(() => useLiveOdds("market-1"));

    for (let i = 0; i <= MAX_RECONNECT_ATTEMPTS; i += 1) {
      const latestSocket = mockSocketInstances[mockSocketInstances.length - 1];
      act(() => {
        latestSocket.trigger("connect_error");
      });

      if (i < MAX_RECONNECT_ATTEMPTS) {
        const backoff = 500 * 2 ** i;
        await act(async () => {
          await vi.advanceTimersByTimeAsync(backoff);
        });
      }
    }

    expect(mockSocketInstances).toHaveLength(MAX_RECONNECT_ATTEMPTS + 1);
    expect(result.current.retryExhausted).toBe(true);
    expect(result.current.status).toBe("polling");

    // Further timer advancement should not open more sockets
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(mockSocketInstances).toHaveLength(MAX_RECONNECT_ATTEMPTS + 1);
  });

  it("re-establishes the subscription when manual retry is invoked", () => {
    const { result } = renderHook(() => useLiveOdds("market-1"));

    act(() => {
      mockSocketInstances[0].trigger("connect_error");
    });
    expect(result.current.isDisconnected).toBe(true);

    act(() => {
      result.current.retry();
    });

    expect(mockSocketInstances).toHaveLength(2);
    expect(result.current.status).toBe("connecting");
    expect(result.current.error).toBeNull();
    expect(result.current.retryCount).toBe(0);

    act(() => {
      mockSocketInstances[1].trigger("connect");
    });

    expect(result.current.status).toBe("connected");
    expect(result.current.isDisconnected).toBe(false);
    expect(result.current.retryExhausted).toBe(false);
  });
});
