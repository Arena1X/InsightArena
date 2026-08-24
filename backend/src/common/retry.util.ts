/**
 * Generic transient-error retry helper with exponential backoff + jitter.
 * Mirrors the retry/backoff shape already used for email delivery
 * (see notifications/email.service.ts) so RPC-style calls elsewhere in the
 * codebase (e.g. Soroban transaction submission) share the same behaviour.
 */

const JITTER_FACTOR = 0.2;

export interface RetryOptions {
  /** Maximum number of attempts, including the first. Default 3. */
  maxAttempts?: number;
  /** Base delay in ms for the exponential backoff. Default 1000. */
  baseDelayMs?: number;
  /** Classifies whether a thrown error is worth retrying. */
  isTransient: (error: unknown) => boolean;
  /** Called before each retry sleep, useful for logging. */
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
}

/** Delay before attempt `attemptIndex` (0-based): baseDelayMs * 4^attemptIndex, ±20% jitter. */
export function computeBackoffDelay(
  baseDelayMs: number,
  attemptIndex: number,
): number {
  const exponential = baseDelayMs * Math.pow(4, attemptIndex);
  const jitter = exponential * JITTER_FACTOR * (Math.random() * 2 - 1);
  return Math.max(0, Math.round(exponential + jitter));
}

/**
 * Retries `fn` while `isTransient` returns true for the thrown error, up to
 * `maxAttempts` total attempts. Non-transient (permanent) errors are thrown
 * immediately without retrying. Throws the last error once attempts are
 * exhausted.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 1000;

  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const isLastAttempt = attempt === maxAttempts - 1;
      if (isLastAttempt || !options.isTransient(error)) {
        throw error;
      }
      const delayMs = computeBackoffDelay(baseDelayMs, attempt);
      options.onRetry?.(error, attempt, delayMs);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}
