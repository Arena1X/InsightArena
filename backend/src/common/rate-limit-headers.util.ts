/** Minimal response shape this helper needs — matches Express's `res`. */
export interface RateLimitHeaderResponse {
  setHeader(name: string, value: string): void;
}

export interface RateLimitHeaderValues {
  /** Max requests allowed for the tier's window. */
  limit: number;
  /** Requests remaining in the current window. */
  remaining: number;
  /** Seconds until the current window resets. */
  resetSeconds: number;
  /** Seconds the client must wait before retrying (set only when throttled). */
  retryAfterSeconds?: number;
}

/**
 * Centralised rate-limit header logic, shared by the throttler guard (which
 * has the only access to per-request hit counts at block time) and any
 * success-path consumer. Always emits the plain, standard header names —
 * @nestjs/throttler suffixes them per-tier (e.g. `X-RateLimit-Limit-auth`),
 * which callers can't rely on.
 */
export function setRateLimitHeaders(
  res: RateLimitHeaderResponse,
  values: RateLimitHeaderValues,
): void {
  res.setHeader('X-RateLimit-Limit', String(values.limit));
  res.setHeader('X-RateLimit-Remaining', String(Math.max(0, values.remaining)));
  res.setHeader('X-RateLimit-Reset', String(Math.ceil(values.resetSeconds)));

  if (values.retryAfterSeconds !== undefined) {
    res.setHeader('Retry-After', String(Math.ceil(values.retryAfterSeconds)));
  }
}
