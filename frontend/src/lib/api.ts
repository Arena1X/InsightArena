import { env } from './env';

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

export type ApiErrorKind = 'network' | 'parse' | 'http';

export class ApiError extends Error {
  kind: ApiErrorKind;
  status: number | null;
  path: string;

  constructor(
    message: string,
    kind: ApiErrorKind,
    path: string,
    status: number | null = null,
  ) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status;
    this.path = path;
  }
}

// ---------------------------------------------------------------------------
// Retry utilities (frontend mirror of backend/src/common/retry.util.ts)
// ---------------------------------------------------------------------------

const JITTER_FACTOR = 0.2;

export interface RetryOptions {
  /** Maximum number of attempts, including the first. Default 3. */
  maxAttempts?: number;
  /** Base delay in ms for the first backoff interval. Default 300. */
  baseDelayMs?: number;
  /** Called before each retry sleep, useful for logging/telemetry. */
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
}

/**
 * Delay before retry `attemptIndex` (0-based):
 *   baseDelayMs × 2^attemptIndex  ±20% jitter
 *
 * Examples with baseDelayMs=300:
 *   attempt 0 → ~300 ms
 *   attempt 1 → ~600 ms
 *   attempt 2 → ~1200 ms
 */
export function computeBackoffDelay(baseDelayMs: number, attemptIndex: number): number {
  const exponential = baseDelayMs * Math.pow(2, attemptIndex);
  const jitter = exponential * JITTER_FACTOR * (Math.random() * 2 - 1);
  return Math.max(0, Math.round(exponential + jitter));
}

/**
 * Returns true for errors that are safe to retry on a GET:
 *   - Network-level failures (fetch threw, no response received)
 *   - HTTP 429 Too Many Requests
 *   - HTTP 5xx server errors  (except 501 Not Implemented)
 *
 * Non-idempotent method calls (POST / PATCH / DELETE) are never passed to
 * this function — the retry wrapper is only applied to GET.
 */
export function isTransientApiError(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  if (error.kind === 'network') return true;
  if (error.kind === 'http' && error.status !== null) {
    return error.status === 429 || (error.status >= 500 && error.status !== 501);
  }
  return false;
}

/**
 * Retries `fn` with exponential backoff while `isTransientApiError` returns
 * true for the thrown error, up to `maxAttempts` total attempts.
 *
 * - Non-transient errors are re-thrown immediately (no delay, no counter
 *   increment).
 * - After all attempts are exhausted the last error is re-thrown so callers
 *   always receive a typed `ApiError`.
 */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 300;

  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      const isLast = attempt === maxAttempts - 1;
      if (isLast || !isTransientApiError(error)) {
        throw error;
      }

      const delayMs = computeBackoffDelay(baseDelayMs, attempt);
      options.onRetry?.(error, attempt + 1, delayMs);
      await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError;
}

// ---------------------------------------------------------------------------
// Core fetch wrapper
// ---------------------------------------------------------------------------

export interface ApiOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  signal?: AbortSignal;
  /** Override retry settings for this request. Pass `{ maxAttempts: 1 }` to disable retries. */
  retry?: RetryOptions;
}

const IDEMPOTENT_METHODS = new Set<string>(['GET']);

async function requestOnce<T>(
  path: string,
  method: string,
  options: ApiOptions,
): Promise<T> {
  const { body, headers, signal, retry: _retry, ...rest } = options;

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
    response = await fetch(`${env.API_URL}${path}`, config);
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

/**
 * Central request dispatcher.
 *
 * GET requests are automatically retried with exponential backoff on transient
 * errors (network failures, 429, 5xx). All other methods are executed once —
 * retrying non-idempotent mutations automatically risks double-submission.
 *
 * Callers can customise or disable retry behaviour via `options.retry`:
 *   // disable retries for a specific GET
 *   apiClient.get('/path', { retry: { maxAttempts: 1 } });
 *
 *   // increase attempts for a critical GET
 *   apiClient.get('/path', { retry: { maxAttempts: 5 } });
 */
async function request<T>(
  path: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  options: ApiOptions = {},
): Promise<T> {
  const shouldRetry = IDEMPOTENT_METHODS.has(method);

  if (shouldRetry) {
    return withRetry(() => requestOnce<T>(path, method, options), options.retry);
  }

  return requestOnce<T>(path, method, options);
}

// ---------------------------------------------------------------------------
// Public API client
// ---------------------------------------------------------------------------

export const apiClient = {
  get: <T>(path: string, options?: ApiOptions) =>
    request<T>(path, 'GET', options),
  post: <T>(path: string, body?: unknown, options?: ApiOptions) =>
    request<T>(path, 'POST', { ...options, body }),
  patch: <T>(path: string, body?: unknown, options?: ApiOptions) =>
    request<T>(path, 'PATCH', { ...options, body }),
  delete: <T>(path: string, options?: ApiOptions) =>
    request<T>(path, 'DELETE', options),
};

// ---------------------------------------------------------------------------
// Profile completeness
// ---------------------------------------------------------------------------

export interface ProfileFieldValues {
  username?: string;
  avatarUrl?: string;
  bio?: string;
}

export interface ProfileFieldDef {
  key: keyof ProfileFieldValues;
  label: string;
  description: string;
}

export const REQUIRED_PROFILE_FIELDS: ProfileFieldDef[] = [
  { key: 'username', label: 'Username', description: 'Choose a display name for your account.' },
  { key: 'avatarUrl', label: 'Profile picture', description: 'Add an avatar so others recognize you.' },
  { key: 'bio', label: 'Bio', description: 'Tell the community a little about yourself.' },
];

/** Returns the required profile fields that are still empty for `user`. */
export function getMissingProfileFields(
  user: ProfileFieldValues | null | undefined,
): ProfileFieldDef[] {
  if (!user) return REQUIRED_PROFILE_FIELDS;
  return REQUIRED_PROFILE_FIELDS.filter((field) => !user[field.key]?.trim());
}

// ---------------------------------------------------------------------------
// Course completion
// ---------------------------------------------------------------------------

export interface CourseCompletionResponse {
  courseId: string;
  status: 'completed';
  awardedAt: string;
}

/** A fresh idempotency key identifying one completion attempt for a course. */
export function generateIdempotencyKey(courseId: string): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `course-complete:${courseId}:${random}`;
}

export function submitCourseCompletion(
  courseId: string,
  idempotencyKey: string,
  options: ApiOptions = {},
): Promise<CourseCompletionResponse> {
  return apiClient.post<CourseCompletionResponse>(
    `/courses/${encodeURIComponent(courseId)}/complete`,
    { idempotencyKey },
    { ...options, headers: { 'Idempotency-Key': idempotencyKey, ...options.headers } },
  );
}

// ---------------------------------------------------------------------------
// Leaderboard
// ---------------------------------------------------------------------------

/** Mirrors backend LeaderboardEntryResponse */
export interface LeaderboardEntryResponse {
  rank: number;
  user_id: string;
  username: string | null;
  stellar_address: string;
  reputation_score: number;
  accuracy_rate: string;
  total_winnings_stroops: string;
  season_points?: number;
  /**
   * Signed rank change vs the most recent prior snapshot.
   * Positive = moved up (lower rank number). Null when no prior snapshot.
   */
  rank_delta?: number | null;
}

export interface PaginatedLeaderboardResponse {
  data: LeaderboardEntryResponse[];
  total: number;
  page: number;
  limit: number;
}

export interface LeaderboardQuery {
  season_id?: string;
  page?: number;
  limit?: number;
}

/** Mirrors backend SnapshotRankingEntryResponse */
export interface SnapshotRankingEntry {
  rank: number;
  user_id: string;
  username: string | null;
  stellar_address: string;
  score: number;
  captured_at: string;
}

export interface SnapshotRankingResponse {
  data: SnapshotRankingEntry[];
  snapshot_date: string;
  total: number;
  page: number;
  limit: number;
  message?: string;
}

export interface SnapshotQuery {
  /** ISO date string YYYY-MM-DD */
  date: string;
  season_id?: string;
  page?: number;
  limit?: number;
}

/**
 * Compute per-user rank deltas between two snapshot rankings.
 * Returns a map of `stellar_address → delta` where a positive delta means
 * the user moved up (their rank number decreased).
 */
export function computeSnapshotDeltas(
  baseline: SnapshotRankingEntry[],
  current: SnapshotRankingEntry[],
): Map<string, number> {
  const baselineRanks = new Map(
    baseline.map((e) => [e.stellar_address, e.rank]),
  );
  const deltas = new Map<string, number>();
  for (const entry of current) {
    const prior = baselineRanks.get(entry.stellar_address);
    if (prior !== undefined) {
      // Positive delta = improved rank (rank number got smaller)
      deltas.set(entry.stellar_address, prior - entry.rank);
    }
  }
  return deltas;
}

/** `GET /api/leaderboard?season_id=...&page=...&limit=...` */
export function getLeaderboard(
  query: LeaderboardQuery = {},
  options?: ApiOptions,
): Promise<PaginatedLeaderboardResponse> {
  const params = new URLSearchParams();
  if (query.season_id) params.set('season_id', query.season_id);
  if (query.page !== undefined) params.set('page', String(query.page));
  if (query.limit !== undefined) params.set('limit', String(query.limit));
  const qs = params.toString();
  return apiClient.get<PaginatedLeaderboardResponse>(
    `/api/leaderboard${qs ? `?${qs}` : ''}`,
    options,
  );
}

/** `GET /api/leaderboard/snapshots?date=YYYY-MM-DD&season_id=...` */
export function getLeaderboardSnapshot(
  query: SnapshotQuery,
  options?: ApiOptions,
): Promise<SnapshotRankingResponse> {
  const params = new URLSearchParams({ date: query.date });
  if (query.season_id) params.set('season_id', query.season_id);
  if (query.page !== undefined) params.set('page', String(query.page));
  if (query.limit !== undefined) params.set('limit', String(query.limit));
  return apiClient.get<SnapshotRankingResponse>(
    `/api/leaderboard/snapshots?${params.toString()}`,
    options,
  );
}

// ---------------------------------------------------------------------------
// Seasons
// ---------------------------------------------------------------------------

export interface SeasonListItem {
  id: string;
  season_number: number;
  name: string;
  starts_at: string;
  ends_at: string;
  reward_pool_stroops: string;
  is_active: boolean;
  is_finalized: boolean;
}

export interface PaginatedSeasonsResponse {
  data: SeasonListItem[];
  total: number;
  page: number;
  limit: number;
}

/** `GET /api/seasons` — ordered by start date descending */
export function getSeasons(
  options?: ApiOptions,
): Promise<PaginatedSeasonsResponse> {
  return apiClient.get<PaginatedSeasonsResponse>('/api/seasons?limit=50', options);
}

/** `GET /api/seasons/active` — the currently active season */
export function getActiveSeason(options?: ApiOptions): Promise<SeasonListItem> {
  return apiClient.get<SeasonListItem>('/api/seasons/active', options);
}
