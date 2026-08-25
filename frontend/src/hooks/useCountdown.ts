import { useState, useEffect } from "react";

const MILLISECONDS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;

const EMPTY_COUNTDOWN: CountdownTime = {
  days: 0,
  hours: 0,
  minutes: 0,
  seconds: 0,
  isExpired: true,
  totalSeconds: 0,
};

export interface CountdownTime {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  isExpired: boolean;
  totalSeconds: number;
}

function getTargetEpochMilliseconds(
  targetDate: string | Date | number,
): number {
  if (typeof targetDate === "number") {
    return targetDate;
  }

  return typeof targetDate === "string"
    ? Date.parse(targetDate)
    : targetDate.getTime();
}

/** Calculate a countdown using only UTC epoch timestamps. */
export function calculateCountdown(
  targetDate: string | Date | number,
  now = Date.now(),
): CountdownTime {
  const target = getTargetEpochMilliseconds(targetDate);
  const difference = target - now;

  if (!Number.isFinite(difference) || difference <= 0) {
    return EMPTY_COUNTDOWN;
  }

  const totalSeconds = Math.floor(difference / MILLISECONDS_PER_SECOND);
  const secondsPerHour = SECONDS_PER_MINUTE * MINUTES_PER_HOUR;
  const secondsPerDay = secondsPerHour * HOURS_PER_DAY;

  return {
    days: Math.floor(totalSeconds / secondsPerDay),
    hours: Math.floor((totalSeconds % secondsPerDay) / secondsPerHour),
    minutes: Math.floor((totalSeconds % secondsPerHour) / SECONDS_PER_MINUTE),
    seconds: totalSeconds % SECONDS_PER_MINUTE,
    isExpired: false,
    totalSeconds,
  };
}

/**
 * Hook to calculate countdown time from a target date.
 * Avoids unnecessary re-renders by only updating when the time actually changes.
 * Returns isExpired=true when target date has passed.
 */
export function useCountdown(
  targetDate: string | Date | number,
): CountdownTime {
  const [time, setTime] = useState<CountdownTime>(() =>
    calculateCountdown(targetDate),
  );

  useEffect(() => {
    const calculateTime = () => {
      setTime(calculateCountdown(targetDate));
    };

    calculateTime();

    const interval = setInterval(calculateTime, 1000);

    return () => clearInterval(interval);
  }, [targetDate]);

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
