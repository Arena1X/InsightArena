
export type ApiErrorKind = 'network' | 'parse' | 'http';

export class ApiError extends Error {
  kind: ApiErrorKind;
  status: number | null;
  path: string;

  constructor(
    message: string,
    kind: ApiErrorKind,
    path: string,
    status: number | null = null
  ) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status;
    this.path = path;
  }
}

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || '';

if (!BASE_URL) {
  console.warn('NEXT_PUBLIC_API_URL is not set. API calls may fail.');
}

interface ApiOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  signal?: AbortSignal;
}

async function request<T>(
  path: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  options: ApiOptions = {}
): Promise<T> {
  const { body, headers, signal, ...rest } = options;

  const config: RequestInit = {
    method,
    signal,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    ...rest,
  };

  if (body !== undefined) {
    config.body = JSON.stringify(body);
  }

  let response: Response;

  try {
    response = await fetch(`${BASE_URL}${path}`, config);
  } catch (error) {
    if (error instanceof Error) {
      throw new ApiError(`Network error: ${error.message}`, 'network', path);
    }
    throw new ApiError('Unknown network error', 'network', path);
  }

  if (!response.ok) {
    let errorMessage = `Request failed with status ${response.status}`;
    try {
      const errorBody = await response.json();
      if (errorBody?.message) {
        errorMessage = errorBody.message;
      } else if (typeof errorBody === 'string') {
        errorMessage = errorBody;
      }
    } catch {
      // Ignore parse errors on error responses
    }
    throw new ApiError(errorMessage, 'http', path, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  try {
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof Error) {
      throw new ApiError(`JSON parse error: ${error.message}`, 'parse', path, response.status);
    }
    throw new ApiError('Unknown JSON parse error', 'parse', path, response.status);
  }
}

export const apiClient = {
  get: <T>(path: string, options?: ApiOptions) => request<T>(path, 'GET', options),
  post: <T>(path: string, body?: unknown, options?: ApiOptions) => request<T>(path, 'POST', { ...options, body }),
  patch: <T>(path: string, body?: unknown, options?: ApiOptions) => request<T>(path, 'PATCH', { ...options, body }),
  delete: <T>(path: string, options?: ApiOptions) => request<T>(path, 'DELETE', options),
};

/**
 * Lightweight reachability check for third-party tool URLs (e.g. the
 * External Tools page). Third-party origins generally don't send CORS
 * headers, so responses are read in 'no-cors' mode: we can't inspect the
 * status code, but a resolved fetch still tells us the host is reachable.
 */
export type ToolHealthStatus = 'online' | 'offline' | 'unknown';

export interface ToolHealthResult {
  status: ToolHealthStatus;
  checkedAt: number;
}

const TOOL_HEALTH_CACHE_TTL_MS = 60_000;
const TOOL_HEALTH_CHECK_TIMEOUT_MS = 5_000;

const toolHealthCache = new Map<string, ToolHealthResult>();

function isCacheFresh(result: ToolHealthResult, now: number): boolean {
  return now - result.checkedAt < TOOL_HEALTH_CACHE_TTL_MS;
}

async function pingUrl(url: string, timeoutMs: number): Promise<ToolHealthStatus> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    await fetch(url, {
      method: 'HEAD',
      mode: 'no-cors',
      cache: 'no-store',
      signal: controller.signal,
    });
    return 'online';
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return 'unknown';
    }
    return 'offline';
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Checks whether a tool's URL is reachable, serving a cached result if one
 * was fetched within TOOL_HEALTH_CACHE_TTL_MS. Never throws: an unexpected
 * error resolves to an 'unknown' status so callers never need a try/catch.
 */
export async function checkToolHealth(
  url: string,
  options: { timeoutMs?: number; force?: boolean } = {}
): Promise<ToolHealthResult> {
  const { timeoutMs = TOOL_HEALTH_CHECK_TIMEOUT_MS, force = false } = options;
  const now = Date.now();
  const cached = toolHealthCache.get(url);

  if (!force && cached && isCacheFresh(cached, now)) {
    return cached;
  }

  let status: ToolHealthStatus;
  try {
    status = await pingUrl(url, timeoutMs);
  } catch {
    status = 'unknown';
  }

  const result: ToolHealthResult = { status, checkedAt: Date.now() };
  toolHealthCache.set(url, result);
  return result;
}

/** Test-only escape hatch to reset module-level cache between test cases. */
export function resetToolHealthCache(): void {
  toolHealthCache.clear();
}

export { TOOL_HEALTH_CACHE_TTL_MS };