import { useState, useEffect } from "react";
import { parseUtcEpochMs } from "../lib/utils";

const MILLISECONDS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;

export interface CountdownTime {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  isExpired: boolean;
  totalSeconds: number;
  /** Granular day count alias (#1592). */
  readonly d: number;
  /** Granular hour count alias (0–23) (#1592). */
  readonly h: number;
  /** Granular minute count alias (0–59) (#1592). */
  readonly m: number;
  /** Granular second count alias (0–59) (#1592). */
  readonly s: number;
  /** Remaining duration in milliseconds, clamped to >= 0 (#1592). */
  readonly remainingMs: number;
  /** Pre-formatted compact countdown label. */
  readonly label: string;
}

export interface UseCountdownOptions {
  frozen?: boolean;
}

function attachCountdownAliases(
  base: {
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
    isExpired: boolean;
    totalSeconds: number;
  },
  remainingMs: number,
): CountdownTime {
  const target = { ...base } as CountdownTime;
  Object.defineProperties(target, {
    d: { value: base.days, enumerable: false, configurable: false },
    h: { value: base.hours, enumerable: false, configurable: false },
    m: { value: base.minutes, enumerable: false, configurable: false },
    s: { value: base.seconds, enumerable: false, configurable: false },
    remainingMs: { value: remainingMs, enumerable: false, configurable: false },
    label: {
      get: () => formatCountdown(target),
      enumerable: false,
      configurable: false,
    },
  });
  return target;
}

const EMPTY_COUNTDOWN: CountdownTime = attachCountdownAliases(
  {
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
    isExpired: true,
    totalSeconds: 0,
  },
  0,
);

function getTargetEpochMilliseconds(
  targetDate: string | Date | number,
): number {
  return parseUtcEpochMs(targetDate);
}

/**
 * Calculate a countdown using only UTC epoch timestamps.
 * Never mixes local-offset Date getters, so local timezone and DST transitions
 * cannot skew remaining durations.
 */
export function calculateCountdown(
  targetDate: string | Date | number,
  now = Date.now(),
): CountdownTime {
  const target = getTargetEpochMilliseconds(targetDate);
  const difference = target - now;

  if (!Number.isFinite(target) || !Number.isFinite(now) || !Number.isFinite(difference) || difference <= 0) {
    return EMPTY_COUNTDOWN;
  }

  const totalSeconds = Math.floor(difference / MILLISECONDS_PER_SECOND);
  const secondsPerHour = SECONDS_PER_MINUTE * MINUTES_PER_HOUR;
  const secondsPerDay = secondsPerHour * HOURS_PER_DAY;

  const days = Math.floor(totalSeconds / secondsPerDay);
  const hours = Math.floor((totalSeconds % secondsPerDay) / secondsPerHour);
  const minutes = Math.floor((totalSeconds % secondsPerHour) / SECONDS_PER_MINUTE);
  const seconds = totalSeconds % SECONDS_PER_MINUTE;

  return attachCountdownAliases(
    {
      days,
      hours,
      minutes,
      seconds,
      isExpired: false,
      totalSeconds,
    },
    difference,
  );
}

/**
 * Hook to calculate countdown time from a target date.
 * Avoids unnecessary re-renders by only updating when the time actually changes.
 * Returns isExpired=true when target date has passed.
 *
 * When `frozen` is true (e.g. the market has resolved), the countdown stops
 * ticking and is pinned to the expired state so the UI can render a stable
 * "Resolved" view instead of a live timer.
 */
export function useCountdown(
  targetDate: string | Date | number,
  frozenOrOptions: boolean | UseCountdownOptions = false,
): CountdownTime {
  const frozen =
    typeof frozenOrOptions === "boolean"
      ? frozenOrOptions
      : Boolean(frozenOrOptions?.frozen);

  const [time, setTime] = useState<CountdownTime>(() =>
    frozen ? EMPTY_COUNTDOWN : calculateCountdown(targetDate),
  );

  useEffect(() => {
    if (frozen) {
      setTime(EMPTY_COUNTDOWN);
      return;
    }

    const calculateTime = () => {
      setTime((prev) => {
        const next = calculateCountdown(targetDate);
        if (
          prev.totalSeconds === next.totalSeconds &&
          prev.isExpired === next.isExpired
        ) {
          return prev;
        }
        return next;
      });
    };

    calculateTime();

    const interval = setInterval(calculateTime, 1000);

    return () => clearInterval(interval);
  }, [targetDate, frozen]);

  return time;
}

/**
 * Format countdown time to a display string.
 * If expired, returns "Event Started" or "Event Locked".
 */
export function formatCountdown(time: CountdownTime, expired?: string): string {
  if (time.isExpired) {
    return expired || "Event Started";
  }

  if (time.days > 0) {
    return `${time.days}d ${time.hours}h`;
  }

  if (time.hours > 0) {
    return `${time.hours}h ${time.minutes}m`;
  }

  if (time.minutes > 0) {
    return `${time.minutes}m ${time.seconds}s`;
  }

  return `${time.seconds}s`;
}
