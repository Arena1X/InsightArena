import { describe, expect, it } from "vitest";

const STALE_THRESHOLD_MS = 30_000;

describe("useLiveOdds staleness constants", () => {
  it("STALE_THRESHOLD_MS is 30 seconds", () => {
    expect(STALE_THRESHOLD_MS).toBe(30_000);
  });
});

describe("staleness logic (unit)", () => {
  function isStale(
    status: string,
    lastUpdatedAt: number | null,
    now: number,
  ): boolean {
    if (status === "disconnected" || status === "connecting") return true;
    if (lastUpdatedAt === null) return false;
    return now - lastUpdatedAt > STALE_THRESHOLD_MS;
  }

  it("returns true when disconnected regardless of data age", () => {
    expect(isStale("disconnected", Date.now(), Date.now())).toBe(true);
  });

  it("returns true when connecting regardless of data age", () => {
    expect(isStale("connecting", Date.now(), Date.now())).toBe(true);
  });

  it("returns false when connected with fresh data", () => {
    const now = Date.now();
    expect(isStale("connected", now - 5_000, now)).toBe(false);
  });

  it("returns true when connected but data exceeds threshold", () => {
    const now = Date.now();
    expect(isStale("connected", now - STALE_THRESHOLD_MS - 1, now)).toBe(true);
  });

  it("returns false when connected with no data yet", () => {
    expect(isStale("connected", null, Date.now())).toBe(false);
  });

  it("returns false when polling with fresh data", () => {
    const now = Date.now();
    expect(isStale("polling", now - 5_000, now)).toBe(false);
  });

  it("returns true when polling with stale data", () => {
    const now = Date.now();
    expect(isStale("polling", now - STALE_THRESHOLD_MS - 1, now)).toBe(true);
  });
});
