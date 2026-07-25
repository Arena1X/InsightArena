
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