import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ApiError,
  apiClient,
  computeBackoffDelay,
  isTransientApiError,
  withRetry,
} from './api';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal fetch Response. */
function makeResponse(
  status: number,
  body: unknown = null,
  ok?: boolean,
): Response {
  const isOk = ok ?? (status >= 200 && status < 300);
  return {
    ok: isOk,
    status,
    json: async () => body,
  } as unknown as Response;
}

/** Shorthand: throw a network-level TypeError (what fetch throws on no connectivity). */
function networkFailure(): Promise<never> {
  return Promise.reject(new TypeError('Failed to fetch'));
}

// ---------------------------------------------------------------------------
// Module-level setup: stub env so env.ts doesn't throw in jsdom
// ---------------------------------------------------------------------------

vi.mock('./env', () => ({ env: { API_URL: 'https://api.test' } }));

// ---------------------------------------------------------------------------
// computeBackoffDelay
// ---------------------------------------------------------------------------

describe('computeBackoffDelay', () => {
  it('returns baseDelayMs for attempt 0 (within jitter band)', () => {
    // With ±20% jitter, result must be between 80% and 120% of baseDelayMs.
    for (let i = 0; i < 50; i++) {
      const delay = computeBackoffDelay(300, 0);
      expect(delay).toBeGreaterThanOrEqual(240); // 300 * 0.8
      expect(delay).toBeLessThanOrEqual(360);    // 300 * 1.2
    }
  });

  it('doubles each attempt (before jitter)', () => {
    // Median values: 300, 600, 1200 for attempts 0,1,2.
    // Allow ±25% to accommodate jitter without relying on Math.random mock.
    const base = 300;
    const expectedMedians = [300, 600, 1200];
    for (let attempt = 0; attempt < 3; attempt++) {
      const delay = computeBackoffDelay(base, attempt);
      const expected = expectedMedians[attempt];
      expect(delay).toBeGreaterThanOrEqual(expected * 0.75);
      expect(delay).toBeLessThanOrEqual(expected * 1.25);
    }
  });

  it('never returns a negative value', () => {
    for (let i = 0; i < 100; i++) {
      expect(computeBackoffDelay(1, 0)).toBeGreaterThanOrEqual(0);
    }
  });
});

// ---------------------------------------------------------------------------
// isTransientApiError
// ---------------------------------------------------------------------------

describe('isTransientApiError', () => {
  it('returns true for network errors', () => {
    expect(isTransientApiError(new ApiError('oops', 'network', '/test'))).toBe(true);
  });

  it('returns true for HTTP 429', () => {
    expect(isTransientApiError(new ApiError('rate limited', 'http', '/test', 429))).toBe(true);
  });

  it.each([500, 502, 503, 504])('returns true for HTTP %i', (status) => {
    expect(isTransientApiError(new ApiError('server error', 'http', '/test', status))).toBe(true);
  });

  it('returns false for HTTP 501 Not Implemented', () => {
    expect(isTransientApiError(new ApiError('not impl', 'http', '/test', 501))).toBe(false);
  });

  it.each([400, 401, 403, 404, 422])('returns false for HTTP %i', (status) => {
    expect(isTransientApiError(new ApiError('client error', 'http', '/test', status))).toBe(false);
  });

  it('returns false for parse errors', () => {
    expect(isTransientApiError(new ApiError('bad json', 'parse', '/test', 200))).toBe(false);
  });

  it('returns false for plain Error', () => {
    expect(isTransientApiError(new Error('generic'))).toBe(false);
  });

  it('returns false for non-Error values', () => {
    expect(isTransientApiError(null)).toBe(false);
    expect(isTransientApiError('string error')).toBe(false);
    expect(isTransientApiError(42)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// withRetry — unit tests (fake timers, no fetch)
// ---------------------------------------------------------------------------

describe('withRetry', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(async () => {
    await vi.runAllTimersAsync();
    vi.useRealTimers();
  });

  it('resolves immediately when fn succeeds on first attempt', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await withRetry(fn, { maxAttempts: 3, baseDelayMs: 0 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries a transient error and resolves on the next attempt', async () => {
    const transient = new ApiError('network blip', 'network', '/test');
    const fn = vi.fn()
      .mockRejectedValueOnce(transient)
      .mockResolvedValue('recovered');

    const promise = withRetry(fn, { maxAttempts: 3, baseDelayMs: 0 });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('throws immediately (no retry) on a non-transient error', async () => {
    const permanent = new ApiError('not found', 'http', '/test', 404);
    const fn = vi.fn().mockRejectedValue(permanent);

    await expect(withRetry(fn, { maxAttempts: 3, baseDelayMs: 0 })).rejects.toThrow('not found');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('exhausts all attempts and surfaces the final error', async () => {
    const transient = new ApiError('gateway timeout', 'http', '/test', 504);
    const fn = vi.fn().mockRejectedValue(transient);
    const onRetry = vi.fn();

    // Attach .catch immediately so the eventual rejection is always observed,
    // preventing the "unhandled rejection" warning when timers drain later.
    const promise = withRetry(fn, { maxAttempts: 3, baseDelayMs: 0, onRetry });
    const settled = promise.catch((e: unknown) => e);

    await vi.runAllTimersAsync();
    const error = await settled;

    expect(error).toMatchObject({ message: 'gateway timeout', kind: 'http', status: 504 });
    expect(fn).toHaveBeenCalledTimes(3);
    // onRetry called between each failed attempt (not after the last one)
    expect(onRetry).toHaveBeenCalledTimes(2);
  });

  it('calls onRetry with attempt number and delay', async () => {
    const transient = new ApiError('server error', 'http', '/test', 500);
    const fn = vi.fn()
      .mockRejectedValueOnce(transient)
      .mockResolvedValue('ok');
    const onRetry = vi.fn();

    const promise = withRetry(fn, { maxAttempts: 3, baseDelayMs: 0, onRetry });
    await vi.runAllTimersAsync();
    await promise;

    expect(onRetry).toHaveBeenCalledTimes(1);
    // attempt number passed to onRetry is 1-based (human readable)
    expect(onRetry).toHaveBeenCalledWith(transient, 1, expect.any(Number));
  });

  it('respects maxAttempts=1 (disables retry)', async () => {
    const transient = new ApiError('network blip', 'network', '/test');
    const fn = vi.fn().mockRejectedValue(transient);

    await expect(withRetry(fn, { maxAttempts: 1, baseDelayMs: 0 })).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// apiClient integration — GET retries, non-idempotent methods do not
// ---------------------------------------------------------------------------

describe('apiClient', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(async () => {
    await vi.runAllTimersAsync();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  // ── GET: transient recovery ──────────────────────────────────────────────

  it('GET recovers transparently from a transient network failure', async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValue(makeResponse(200, { id: 1 }));

    const promise = apiClient.get('/items');
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toEqual({ id: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('GET recovers transparently from a transient 503 response', async () => {
    fetchMock
      .mockResolvedValueOnce(makeResponse(503, { message: 'Service Unavailable' }))
      .mockResolvedValue(makeResponse(200, { id: 2 }));

    const promise = apiClient.get('/items');
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toEqual({ id: 2 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('GET recovers transparently from a transient 429 response', async () => {
    fetchMock
      .mockResolvedValueOnce(makeResponse(429, { message: 'Too Many Requests' }))
      .mockResolvedValue(makeResponse(200, { ok: true }));

    const promise = apiClient.get('/items');
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('GET exhausts retries and throws the final ApiError', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    // Attach .catch immediately so the settled rejection is always observed.
    const promise = apiClient.get('/items');
    const settled = promise.catch((e: unknown) => e);

    await vi.runAllTimersAsync();
    const error = await settled;

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe('network');
    // Default maxAttempts = 3
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('GET does not retry a permanent 404 error', async () => {
    fetchMock.mockResolvedValue(makeResponse(404, { message: 'Not Found' }));

    await expect(apiClient.get('/items')).rejects.toMatchObject({
      kind: 'http',
      status: 404,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('GET retry count is controllable via options.retry', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    const error = await apiClient
      .get('/items', { retry: { maxAttempts: 1, baseDelayMs: 0 } })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // ── Non-idempotent methods: never retried ────────────────────────────────

  it('POST is not retried on a network error', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(apiClient.post('/items', { name: 'x' })).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('PATCH is not retried on a network error', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(apiClient.patch('/items/1', { name: 'y' })).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('DELETE is not retried on a network error', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(apiClient.delete('/items/1')).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('POST is not retried on a 503 server error', async () => {
    fetchMock.mockResolvedValue(makeResponse(503, { message: 'Service Unavailable' }));

    await expect(apiClient.post('/items', {})).rejects.toMatchObject({ status: 503 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // ── Successful responses (no retry needed) ───────────────────────────────

  it('GET resolves with response body on first success', async () => {
    fetchMock.mockResolvedValue(makeResponse(200, { name: 'Alice' }));
    const result = await apiClient.get('/user');
    expect(result).toEqual({ name: 'Alice' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('GET returns undefined for 204 No Content', async () => {
    fetchMock.mockResolvedValue(makeResponse(204));
    const result = await apiClient.get('/action');
    expect(result).toBeUndefined();
  });

  it('POST sends the body as JSON', async () => {
    fetchMock.mockResolvedValue(makeResponse(201, { id: 99 }));
    await apiClient.post('/items', { name: 'widget' });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.test/items',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'widget' }),
      }),
    );
  });

  // ── AbortSignal is forwarded ─────────────────────────────────────────────

  it('forwards the AbortSignal to fetch', async () => {
    fetchMock.mockResolvedValue(makeResponse(200, {}));
    const controller = new AbortController();
    await apiClient.get('/items', { signal: controller.signal });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ signal: controller.signal }),
    );
  });

  // ── URL construction ─────────────────────────────────────────────────────

  it('prepends the API_URL to the path', async () => {
    fetchMock.mockResolvedValue(makeResponse(200, {}));
    await apiClient.get('/health');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.test/health',
      expect.any(Object),
    );
  });
});

// ---------------------------------------------------------------------------
// useHookErrorMessage integration
// ---------------------------------------------------------------------------

describe('getHookErrorMessage + ApiError', () => {
  it('returns the generic network message for an ApiError with kind=network', async () => {
    const { getHookErrorMessage } = await import('@/hooks/useHookErrorMessage');
    const error = new ApiError('Network error: Failed to fetch', 'network', '/test');
    expect(getHookErrorMessage(error, 'fallback')).toBe(
      'Network error. Please check your connection and try again.',
    );
  });

  it('returns the HTTP error message for an ApiError with kind=http', async () => {
    const { getHookErrorMessage } = await import('@/hooks/useHookErrorMessage');
    const error = new ApiError('Not Found', 'http', '/test', 404);
    expect(getHookErrorMessage(error, 'fallback')).toBe('Not Found');
  });

  it('returns fallback for an unknown error shape', async () => {
    const { getHookErrorMessage } = await import('@/hooks/useHookErrorMessage');
    expect(getHookErrorMessage(null, 'Something went wrong')).toBe('Something went wrong');
  });
});
