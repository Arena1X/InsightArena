import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { Axios } from 'axios';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { NextFunction, Request, Response } from 'express';

export const CORRELATION_ID_HEADER = 'x-correlation-id';
export const ALT_INCOMING_HEADER = 'x-request-id';
const MAX_CORRELATION_ID_LENGTH = 128;
const CORRELATION_ID_PATTERN = /^[\w.:\-=/]+$/;

export const correlationIdStorage = new AsyncLocalStorage<string>();

export interface CorrelationRequest {
  id?: unknown;
  headers?: IncomingMessage['headers'];
}

export interface CorrelationResponse {
  setHeader(name: string, value: string): unknown;
  headersSent?: boolean;
}

export function getCorrelationId(): string | undefined {
  return correlationIdStorage.getStore();
}

export function runWithCorrelationId<T>(
  id: string = randomUUID(),
  fn: () => T,
): T {
  return correlationIdStorage.run(id, fn);
}

export function withCorrelationId<TArgs extends unknown[], TReturn>(
  fn: (...args: TArgs) => TReturn,
  idFactory: (...args: TArgs) => string = () => randomUUID(),
): (...args: TArgs) => TReturn {
  return (...args: TArgs) => {
    const id = getCorrelationId() ?? idFactory(...args);
    return correlationIdStorage.run(id, () => fn(...args));
  };
}

export function readIncomingCorrelationId(
  req: CorrelationRequest,
): string | undefined {
  const headers = req.headers ?? {};
  let raw: unknown =
    headers[CORRELATION_ID_HEADER] ?? headers[ALT_INCOMING_HEADER];

  if (raw === undefined) {
    for (const [key, value] of Object.entries(headers)) {
      const lower = key.toLowerCase();
      if (lower === CORRELATION_ID_HEADER) {
        raw = value;
        break;
      }
      if (lower === ALT_INCOMING_HEADER && raw === undefined) {
        raw = value;
      }
    }
  }

  const value: unknown = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  if (
    !trimmed ||
    trimmed.length > MAX_CORRELATION_ID_LENGTH ||
    !CORRELATION_ID_PATTERN.test(trimmed)
  ) {
    return undefined;
  }
  return trimmed;
}

export function assignCorrelationId(
  req: CorrelationRequest,
  res?: CorrelationResponse | null,
): string {
  const existingId =
    typeof req.id === 'string' && req.id
      ? req.id
      : typeof req.id === 'number'
        ? String(req.id)
        : undefined;

  const id =
    existingId ||
    readIncomingCorrelationId(req) ||
    getCorrelationId() ||
    randomUUID();

  (req as { id?: unknown }).id = id;

  if (res && typeof res.setHeader === 'function') {
    const headersSent =
      'headersSent' in res
        ? Boolean((res as { headersSent?: boolean }).headersSent)
        : false;
    if (!headersSent) {
      try {
        res.setHeader(CORRELATION_ID_HEADER, id);
      } catch {
        // Headers already sent or invalid state; safely ignore.
      }
    }
  }

  return id;
}

export function bindCorrelationId(
  req: CorrelationRequest,
  res?: CorrelationResponse | null,
): string {
  const id = assignCorrelationId(req, res);
  correlationIdStorage.enterWith(id);
  return id;
}

export function correlationIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const id = assignCorrelationId(req, res);
  correlationIdStorage.run(id, () => next());
}

export function pinoGenReqId(
  req: IncomingMessage,
  res: ServerResponse,
): string {
  return assignCorrelationId(req, res);
}

export function pinoCorrelationProps(req: IncomingMessage): {
  correlationId: string | undefined;
} {
  const reqId =
    typeof (req as CorrelationRequest).id === 'string'
      ? ((req as CorrelationRequest).id as string)
      : undefined;
  return {
    correlationId: reqId ?? getCorrelationId(),
  };
}

export function pinoHttpCorrelationOptions() {
  return {
    genReqId: pinoGenReqId,
    customProps: pinoCorrelationProps,
    mixin: () => {
      const id = getCorrelationId();
      return id ? { correlationId: id } : {};
    },
  };
}

function setAxiosCorrelationHeader(headers: unknown, id: string): void {
  if (!headers) {
    return;
  }
  const record = headers as {
    set?: (name: string, value: string) => void;
    has?: (name: string) => boolean;
    get?: (name: string) => unknown;
    [key: string]: unknown;
  };

  if (typeof record.has === 'function' && record.has(CORRELATION_ID_HEADER)) {
    return;
  }
  if (typeof record.get === 'function' && record.get(CORRELATION_ID_HEADER)) {
    return;
  }
  const hasExisting = Object.keys(record).some(
    (k) => k.toLowerCase() === CORRELATION_ID_HEADER && Boolean(record[k]),
  );
  if (hasExisting) {
    return;
  }
  if (typeof record.set === 'function') {
    record.set(CORRELATION_ID_HEADER, id);
    return;
  }
  record[CORRELATION_ID_HEADER] = id;
}

export function installAxiosCorrelationIdPropagation(): void {
  const proto = Axios.prototype;
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const originalRequest = proto.request;
  if (
    (originalRequest as { __insightArenaCorrelationId?: boolean })
      .__insightArenaCorrelationId
  ) {
    return;
  }

  function requestWithCorrelationId(
    this: unknown,
    configOrUrl?: unknown,
    maybeConfig?: unknown,
  ): unknown {
    const id = getCorrelationId();

    if (typeof configOrUrl === 'string') {
      const config =
        typeof maybeConfig === 'object' && maybeConfig !== null
          ? (maybeConfig as Record<string, unknown>)
          : {};
      if (id) {
        const headers = (config.headers ?? {}) as Record<string, unknown>;
        config.headers = headers;
        setAxiosCorrelationHeader(headers, id);
      }
      return originalRequest.call(this, configOrUrl, config);
    }

    const config =
      typeof configOrUrl === 'object' && configOrUrl !== null
        ? (configOrUrl as Record<string, unknown>)
        : {};
    if (id) {
      const headers = (config.headers ?? {}) as Record<string, unknown>;
      config.headers = headers;
      setAxiosCorrelationHeader(headers, id);
    }
    return originalRequest.call(this, config as never);
  }

  (
    requestWithCorrelationId as { __insightArenaCorrelationId?: boolean }
  ).__insightArenaCorrelationId = true;
  proto.request = requestWithCorrelationId as typeof proto.request;
}

export function installFetchCorrelationIdPropagation(): void {
  const originalFetch = globalThis.fetch;
  if (
    originalFetch &&
    !(originalFetch as { __insightArenaCorrelationId?: boolean })
      .__insightArenaCorrelationId
  ) {
    const fetchWithCorrelationId: typeof fetch = (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      const id = getCorrelationId();
      if (!id) {
        return originalFetch(input, init);
      }

      if (typeof Request !== 'undefined' && input instanceof Request) {
        const headers = new Headers(input.headers);
        if (init?.headers) {
          const initHeaders = new Headers(init.headers);
          initHeaders.forEach((v, k) => headers.set(k, v));
        }
        if (!headers.has(CORRELATION_ID_HEADER)) {
          headers.set(CORRELATION_ID_HEADER, id);
        }
        return originalFetch(new Request(input, { ...init, headers }));
      }

      const headers = new Headers(init?.headers);
      if (!headers.has(CORRELATION_ID_HEADER)) {
        headers.set(CORRELATION_ID_HEADER, id);
      }
      return originalFetch(input, { ...init, headers });
    };

    (
      fetchWithCorrelationId as { __insightArenaCorrelationId?: boolean }
    ).__insightArenaCorrelationId = true;
    globalThis.fetch = fetchWithCorrelationId;
  }
}

export function installOutboundCorrelationIdPropagation(): void {
  installAxiosCorrelationIdPropagation();
  installFetchCorrelationIdPropagation();
}
