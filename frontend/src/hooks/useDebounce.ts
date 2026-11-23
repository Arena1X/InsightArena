"use client";

import { useEffect, useState, useRef, useCallback } from "react";

/**
 * Returns a debounced copy of `value` that only updates after `delay` ms of
 * inactivity. Useful for read-only derived state (e.g. driving a search query).
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

/**
 * Returns a stable debounced function that delays invoking `fn` until after
 * `delay` ms have elapsed since the last call. Any in-flight call is cancelled
 * when a new one arrives.
 *
 * The returned function also exposes a `.cancel()` method to clear any pending
 * invocation imperatively (e.g. on component unmount or form reset).
 *
 * Pass `{ leading: true }` to invoke `fn` immediately on the first call of a
 * burst; follow-up calls within `delay` ms are then debounced, and the latest
 * one fires on the trailing edge. Default is trailing-only.
 *
 * @example
 * const debouncedValidate = useDebouncedCallback(
 *   (value: string) => checkAvailability(value),
 *   300,
 * );
 *
 * // In onChange handler:
 * debouncedValidate(inputValue);
 *
 * // On unmount / reset:
 * debouncedValidate.cancel();
 */
export function useDebouncedCallback<T extends (...args: any[]) => any>(
  fn: T,
  delay: number,
  options?: { leading?: boolean }
): T & { cancel: () => void } {
  const leading = options?.leading ?? false;
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  );
  // Latest args queued for the trailing edge; undefined when nothing is pending.
  const pendingArgsRef = useRef<Parameters<T> | undefined>(undefined);
  // Keep a stable ref to the latest `fn` so callers don't need to memo it.
  const fnRef = useRef<T>(fn);
  useEffect(() => {
    fnRef.current = fn;
  });

  const cancel = useCallback(() => {
    if (timerRef.current !== undefined) {
      clearTimeout(timerRef.current);
      timerRef.current = undefined;
    }
    pendingArgsRef.current = undefined;
  }, []);

  const debounced = useCallback(
    (...args: Parameters<T>) => {
      // Idle = no active quiet-period timer, i.e. this call starts a new burst.
      const isIdle = timerRef.current === undefined;
      if (timerRef.current !== undefined) {
        clearTimeout(timerRef.current);
      }
      if (leading && isIdle) {
        fnRef.current(...args);
      } else {
        pendingArgsRef.current = args;
      }
      timerRef.current = setTimeout(() => {
        timerRef.current = undefined;
        const pending = pendingArgsRef.current;
        pendingArgsRef.current = undefined;
        if (pending) fnRef.current(...pending);
      }, delay);
    },
    [delay, leading]
  ) as T;

  // Attach cancel so consumers can call debounced.cancel().
  (debounced as T & { cancel: () => void }).cancel = cancel;

  // Clean up on unmount.
  useEffect(() => cancel, [cancel]);

  return debounced as T & { cancel: () => void };
}
