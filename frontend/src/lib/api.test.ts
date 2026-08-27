import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkToolHealth,
  resetToolHealthCache,
  TOOL_HEALTH_CACHE_TTL_MS,
} from "./api";

describe("checkToolHealth", () => {
  beforeEach(() => {
    resetToolHealthCache();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("derives status from the outcome of the reachability check", async () => {
    const fetchMock = vi.mocked(fetch);

    fetchMock.mockResolvedValueOnce(new Response(null));
    const online = await checkToolHealth("https://online.example");
    expect(online.status).toBe("online");
    expect(typeof online.checkedAt).toBe("number");

    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const offline = await checkToolHealth("https://offline.example");
    expect(offline.status).toBe("offline");

    fetchMock.mockRejectedValueOnce(
      new DOMException("The operation was aborted.", "AbortError")
    );
    const timedOut = await checkToolHealth("https://timeout.example");
    expect(timedOut.status).toBe("unknown");
  });

  it("serves cached results within the TTL window and refetches once it expires", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(new Response(null));

    vi.useFakeTimers();
    vi.setSystemTime(0);

    const first = await checkToolHealth("https://cached.example");
    expect(first.status).toBe("online");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Still within the cache TTL: no new network call, same cached result.
    vi.setSystemTime(TOOL_HEALTH_CACHE_TTL_MS - 1_000);
    const second = await checkToolHealth("https://cached.example");
    expect(second).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Past the TTL: a fresh check is performed.
    vi.setSystemTime(TOOL_HEALTH_CACHE_TTL_MS + 1_000);
    const third = await checkToolHealth("https://cached.example");
    expect(third.status).toBe("online");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
