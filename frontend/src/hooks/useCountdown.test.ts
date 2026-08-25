import { describe, expect, it } from "vitest";
import { calculateCountdown } from "./useCountdown";

describe("calculateCountdown", () => {
  it("calculates elapsed UTC time across a DST transition", () => {
    const now = Date.parse("2024-03-10T06:30:00.000Z");
    const target = Date.parse("2024-03-10T07:30:00.000Z");

    expect(calculateCountdown(target, now)).toEqual({
      days: 0,
      hours: 1,
      minutes: 0,
      seconds: 0,
      isExpired: false,
      totalSeconds: 3600,
    });
  });

  it("returns a zeroed expired countdown for past targets", () => {
    const now = Date.parse("2026-08-25T12:00:00.000Z");

    expect(calculateCountdown("2026-08-25T11:59:59.000Z", now)).toEqual({
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
      isExpired: true,
      totalSeconds: 0,
    });
  });

  it("handles invalid dates and large ranges without non-finite fields", () => {
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

    expect(calculateCountdown("9999-12-31T23:59:59.000Z", now)).toMatchObject({
      isExpired: false,
      days: expect.any(Number),
      totalSeconds: expect.any(Number),
    });
  });
});
