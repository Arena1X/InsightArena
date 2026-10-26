import { describe, expect, it, vi, afterEach } from "vitest";
import {
  calculateCountdown,
  formatCountdown,
} from "./useCountdown";
import { parseUtcEpochMs } from "../lib/utils";

describe("calculateCountdown & useCountdown (#1592)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("calculates elapsed UTC time across a spring-forward DST transition", () => {
    const now = Date.parse("2024-03-10T06:30:00.000Z");
    const target = Date.parse("2024-03-10T07:30:00.000Z");

    const result = calculateCountdown(target, now);
    expect(result).toEqual({
      days: 0,
      hours: 1,
      minutes: 0,
      seconds: 0,
      isExpired: false,
      totalSeconds: 3600,
    });
    expect(result.d).toBe(0);
    expect(result.h).toBe(1);
    expect(result.m).toBe(0);
    expect(result.s).toBe(0);
    expect(result.remainingMs).toBe(3_600_000);
    expect(result.label).toBe("1h 0m");
  });

  it("calculates elapsed UTC time across a fall-back DST transition and explicit UTC offsets", () => {
    // 2024-11-03 05:30Z (01:30 EDT, -04:00) -> 2024-11-03 07:45:12Z (02:45:12 EST, -05:00)
    // True elapsed time is 2h 15m 12s (8112s), regardless of local clock fallback.
    const now = Date.parse("2024-11-03T01:30:00.000-04:00");
    const target = "2024-11-03T02:45:12.000-05:00";

    const result = calculateCountdown(target, now);
    expect(result).toEqual({
      days: 0,
      hours: 2,
      minutes: 15,
      seconds: 12,
      isExpired: false,
      totalSeconds: 8112,
    });
    expect(result.d).toBe(0);
    expect(result.h).toBe(2);
    expect(result.m).toBe(15);
    expect(result.s).toBe(12);
  });

  it("normalizes timezone-less ISO date-time strings to UTC instead of local browser offset", () => {
    const now = Date.parse("2024-03-10T06:00:00.000Z");
    const withoutZ = calculateCountdown("2024-03-10T07:30:45", now);
    const withSpace = calculateCountdown("2024-03-10 07:30:45", now);
    const withZ = calculateCountdown("2024-03-10T07:30:45Z", now);

    expect(withoutZ).toEqual(withZ);
    expect(withSpace).toEqual(withZ);
    expect(withoutZ.hours).toBe(1);
    expect(withoutZ.minutes).toBe(30);
    expect(withoutZ.seconds).toBe(45);
    expect(parseUtcEpochMs("1710055845000")).toBe(1710055845000);
  });

  it("returns a zeroed expired countdown for past targets and exact-zero boundary", () => {
    const now = Date.parse("2026-08-25T12:00:00.000Z");

    const past = calculateCountdown("2026-08-25T11:59:59.000Z", now);
    expect(past).toEqual({
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
      isExpired: true,
      totalSeconds: 0,
    });
    expect(past.d).toBe(0);
    expect(past.h).toBe(0);
    expect(past.m).toBe(0);
    expect(past.s).toBe(0);
    expect(past.remainingMs).toBe(0);
    expect(formatCountdown(past, "Closed")).toBe("Closed");

    const exactZero = calculateCountdown(now, now);
    expect(exactZero.isExpired).toBe(true);
    expect(exactZero.totalSeconds).toBe(0);
  });

  it("handles invalid dates and very large ranges without 32-bit overflow or non-finite fields", () => {
    const now = Date.parse("2026-08-25T12:00:00.000Z");
    const countdown = calculateCountdown("not-a-date", now);

    expect(countdown).toEqual({
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
      isExpired: true,
      totalSeconds: 0,
    });

    const farFuture = calculateCountdown("9999-12-31T23:59:59.000Z", now);
    expect(farFuture).toMatchObject({
      isExpired: false,
      days: 2912206,
      hours: 11,
      minutes: 59,
      seconds: 59,
      totalSeconds: 251614641599,
    });
    expect(farFuture.d).toBe(2912206);
    expect(farFuture.h).toBe(11);
    expect(farFuture.m).toBe(59);
    expect(farFuture.s).toBe(59);
  });

  it("ticks accurately across a DST transition using system clock UTC epoch", () => {
    vi.useFakeTimers();
    const start = Date.parse("2024-03-10T06:59:58.000Z");
    const target = "2024-03-10T07:00:00.000Z";
    vi.setSystemTime(start);

    const tick0 = calculateCountdown(target);
    expect(tick0.isExpired).toBe(false);
    expect(tick0.seconds).toBe(2);
    expect(tick0.s).toBe(2);
    expect(formatCountdown(tick0)).toBe("2s");

    vi.advanceTimersByTime(1000);
    const tick1 = calculateCountdown(target);
    expect(tick1.seconds).toBe(1);
    expect(tick1.s).toBe(1);
    expect(formatCountdown(tick1)).toBe("1s");

    vi.advanceTimersByTime(1000);
    const tick2 = calculateCountdown(target);
    expect(tick2.isExpired).toBe(true);
    expect(tick2.totalSeconds).toBe(0);
    expect(formatCountdown(tick2)).toBe("Event Started");
  });
});
