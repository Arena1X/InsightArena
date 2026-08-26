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
  delay: number
): T & { cancel: () => void } {
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  );
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
  }, []);

  const debounced = useCallback(
    (...args: Parameters<T>) => {
      cancel();
      timerRef.current = setTimeout(() => {
        timerRef.current = undefined;
        fnRef.current(...args);
      }, delay);
    },
    [cancel, delay]
  ) as T;

  // Attach cancel so consumers can call debounced.cancel().
  (debounced as T & { cancel: () => void }).cancel = cancel;

  // Clean up on unmount.
  useEffect(() => cancel, [cancel]);

  return debounced as T & { cancel: () => void };
}
