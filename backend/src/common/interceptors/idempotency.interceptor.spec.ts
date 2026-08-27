import { Test, TestingModule } from '@nestjs/testing';
import {
  CallHandler,
  ConflictException,
  ExecutionContext,
  UnprocessableEntityException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { of } from 'rxjs';
import { IdempotencyInterceptor } from './idempotency.interceptor';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { IdempotencyKey } from '../idempotency/idempotency-key.entity';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeHash(method: string, url: string, body: unknown): string {
  return createHash('sha256')
    .update(`${method}:${url}:${JSON.stringify(body ?? {})}`)
    .digest('hex');
}

function makeRecord(overrides: Partial<IdempotencyKey> = {}): IdempotencyKey {
  return {
    id: 'record-1',
    key: 'POST:/predictions:idempotency-key-abc',
    userId: 'user-1',
    request_hash: makeHash('POST', '/predictions', { amount: 100 }),
    status_code: 201,
    response_body: { id: 'pred-1', status: 'open' },
    in_progress: false,
    created_at: new Date(),
    ...overrides,
  } as IdempotencyKey;
}

/**
 * Builds a minimal ExecutionContext that satisfies the interceptor's
 * switchToHttp() calls.
 */
function makeContext(opts: {
  method?: string;
  url?: string;
  routePath?: string;
  body?: unknown;
  userId?: string;
  idempotencyKey?: string | undefined;
  responseStatusCode?: number;
}): ExecutionContext {
  const {
    method = 'POST',
    url = '/predictions',
    routePath = '/predictions',
    body = { amount: 100 },
    userId = 'user-1',
    idempotencyKey,
    responseStatusCode = 201,
  } = opts;

  const headers: Record<string, string | undefined> = {};
  if (idempotencyKey !== undefined) {
    headers['idempotency-key'] = idempotencyKey;
  }

  const request = {
    method,
    originalUrl: url,
    route: { path: routePath },
    headers,
    body,
    user: userId ? { id: userId } : undefined,
  };

  const response = {
    statusCode: responseStatusCode,
    setHeader: jest.fn(),
  };

  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;
}

function makeHandler(returnValue: unknown = { id: 'pred-1' }): CallHandler {
  return { handle: jest.fn(() => of(returnValue)) };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('IdempotencyInterceptor', () => {
  let interceptor: IdempotencyInterceptor;
  let idempotencyService: jest.Mocked<
    Pick<IdempotencyService, 'acquire' | 'complete' | 'release'>
  >;

  beforeEach(async () => {
    idempotencyService = {
      acquire: jest.fn(),
      complete: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IdempotencyInterceptor,
        { provide: IdempotencyService, useValue: idempotencyService },
      ],
    }).compile();

    interceptor = module.get<IdempotencyInterceptor>(IdempotencyInterceptor);
  });

  // -------------------------------------------------------------------------
  // Requirement 4 — no header → pass through, no idempotency logic
  // -------------------------------------------------------------------------
  describe('when no Idempotency-Key header is present', () => {
    it('passes through to the handler without touching IdempotencyService', async () => {
      const handler = makeHandler({ id: 'new-pred' });
      const ctx = makeContext({ idempotencyKey: undefined });

      const result$ = await interceptor.intercept(ctx, handler);

      const value = await new Promise((resolve) =>
        result$.subscribe((v) => resolve(v)),
      );

      expect(value).toEqual({ id: 'new-pred' });
      expect(idempotencyService.acquire).not.toHaveBeenCalled();
      expect(handler.handle).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // GET (and other read methods) → always pass through
  // -------------------------------------------------------------------------
  describe('when the HTTP method is not mutating', () => {
    it('passes GET requests through without idempotency checks', async () => {
      const handler = makeHandler([{ id: 'pred-1' }]);
      const ctx = makeContext({
        method: 'GET',
        idempotencyKey: 'some-key',
      });

      const result$ = await interceptor.intercept(ctx, handler);

      const value = await new Promise((resolve) =>
        result$.subscribe((v) => resolve(v)),
      );

      expect(value).toEqual([{ id: 'pred-1' }]);
      expect(idempotencyService.acquire).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Requirement 1 — first request executes handler and stores the response
  // -------------------------------------------------------------------------
  describe('first request with a given Idempotency-Key', () => {
    it('executes the handler and persists the response via IdempotencyService', async () => {
      const freshRecord = makeRecord({ id: 'record-new', in_progress: true });
      idempotencyService.acquire.mockResolvedValue({
        acquired: true,
        record: freshRecord,
      });

      const responseBody = { id: 'pred-1', status: 'open' };
      const handler = makeHandler(responseBody);
      const ctx = makeContext({ idempotencyKey: 'idempotency-key-abc' });

      const result$ = await interceptor.intercept(ctx, handler);

      await new Promise<void>((resolve) => result$.subscribe(() => resolve()));

      // Handler must have been called exactly once
      expect(handler.handle).toHaveBeenCalledTimes(1);

      // Response must have been persisted
      expect(idempotencyService.complete).toHaveBeenCalledWith(
        'record-new',
        201,
        responseBody,
      );
      expect(idempotencyService.release).not.toHaveBeenCalled();
    });

    it('releases the key when the handler throws, so the client can retry', async () => {
      const { throwError } = await import('rxjs');

      const freshRecord = makeRecord({ id: 'record-throw', in_progress: true });
      idempotencyService.acquire.mockResolvedValue({
        acquired: true,
        record: freshRecord,
      });

      const throwingHandler: CallHandler = {
        handle: jest.fn(() => throwError(() => new Error('downstream failure'))),
      };

      const ctx = makeContext({ idempotencyKey: 'idempotency-key-abc' });
      const result$ = await interceptor.intercept(ctx, throwingHandler);

      await new Promise<void>((resolve) =>
        result$.subscribe({ error: () => resolve() }),
      );

      expect(idempotencyService.release).toHaveBeenCalledWith('record-throw');
      expect(idempotencyService.complete).not.toHaveBeenCalledWith(
        'record-throw',
        expect.anything(),
        expect.anything(),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Requirement 2 — replayed request returns stored response, handler NOT called
  // -------------------------------------------------------------------------
  describe('replayed request with same Idempotency-Key + same user + same route', () => {
    it('returns stored response without re-invoking the handler', async () => {
      const requestBody = { amount: 100 };
      const storedResponse = { id: 'pred-1', status: 'open' };
      const hash = makeHash('POST', '/predictions', requestBody);

      const existingRecord = makeRecord({
        request_hash: hash,
        response_body: storedResponse,
        status_code: 201,
        in_progress: false,
      });

      // First call → acquire succeeds (fresh key)
      const firstHandler = makeHandler(storedResponse);
      idempotencyService.acquire.mockResolvedValueOnce({
        acquired: true,
        record: makeRecord({ id: 'record-1', in_progress: true }),
      });

      const ctx = makeContext({
        idempotencyKey: 'idempotency-key-abc',
        body: requestBody,
      });

      const first$ = await interceptor.intercept(ctx, firstHandler);
      await new Promise<void>((resolve) => first$.subscribe(() => resolve()));
      expect(firstHandler.handle).toHaveBeenCalledTimes(1);

      // Second call → acquire returns existing record (not acquired)
      const secondHandler = makeHandler({ id: 'pred-different' });
      idempotencyService.acquire.mockResolvedValueOnce({
        acquired: false,
        record: existingRecord,
      });

      const second$ = await interceptor.intercept(ctx, secondHandler);
      const replayedValue = await new Promise((resolve) =>
        second$.subscribe((v) => resolve(v)),
      );

      // Stored response is replayed
      expect(replayedValue).toEqual(storedResponse);
      // Handler was NOT called a second time
      expect(secondHandler.handle).not.toHaveBeenCalled();
    });

    it('handler is called exactly once total across the two requests', async () => {
      const requestBody = { amount: 100 };
      const hash = makeHash('POST', '/predictions', requestBody);

      const freshRecord = makeRecord({ id: 'r1', in_progress: true });
      const storedRecord = makeRecord({
        id: 'r1',
        request_hash: hash,
        response_body: { id: 'pred-1' },
        status_code: 201,
        in_progress: false,
      });

      idempotencyService.acquire
        .mockResolvedValueOnce({ acquired: true, record: freshRecord })
        .mockResolvedValueOnce({ acquired: false, record: storedRecord });

      const handler = makeHandler({ id: 'pred-1' });
      const ctx = makeContext({
        idempotencyKey: 'idempotency-key-abc',
        body: requestBody,
      });

      const first$ = await interceptor.intercept(ctx, handler);
      await new Promise<void>((resolve) => first$.subscribe(() => resolve()));

      const second$ = await interceptor.intercept(ctx, handler);
      await new Promise<void>((resolve) => second$.subscribe(() => resolve()));

      // handler.handle called exactly once total
      expect(handler.handle).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // Requirement 3 — same key value, different user → no collision
  // -------------------------------------------------------------------------
  describe('same Idempotency-Key value used by a different user', () => {
    it('executes the handler independently for each user', async () => {
      const user1Record = makeRecord({ id: 'r-user1', userId: 'user-1' });
      const user2Record = makeRecord({ id: 'r-user2', userId: 'user-2' });

      // Both requests acquire successfully (different userId scopes)
      idempotencyService.acquire
        .mockResolvedValueOnce({ acquired: true, record: user1Record })
        .mockResolvedValueOnce({ acquired: true, record: user2Record });

      const handler1 = makeHandler({ owner: 'user-1' });
      const handler2 = makeHandler({ owner: 'user-2' });

      const ctx1 = makeContext({
        idempotencyKey: 'shared-key',
        userId: 'user-1',
      });
      const ctx2 = makeContext({
        idempotencyKey: 'shared-key',
        userId: 'user-2',
      });

      const first$ = await interceptor.intercept(ctx1, handler1);
      await new Promise<void>((resolve) => first$.subscribe(() => resolve()));

      const second$ = await interceptor.intercept(ctx2, handler2);
      await new Promise<void>((resolve) => second$.subscribe(() => resolve()));

      // Both handlers must have executed independently
      expect(handler1.handle).toHaveBeenCalledTimes(1);
      expect(handler2.handle).toHaveBeenCalledTimes(1);

      // Service was called with different userIds
      expect(idempotencyService.acquire).toHaveBeenNthCalledWith(
        1,
        expect.any(String),
        'user-1',
        expect.any(String),
      );
      expect(idempotencyService.acquire).toHaveBeenNthCalledWith(
        2,
        expect.any(String),
        'user-2',
        expect.any(String),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Same key, same user, different route → no collision
  // -------------------------------------------------------------------------
  describe('same Idempotency-Key value on a different route for the same user', () => {
    it('executes the handler independently for each route', async () => {
      const predictionsRecord = makeRecord({
        id: 'r-predictions',
        key: 'POST:/predictions:shared-key',
      });
      const marketsRecord = makeRecord({
        id: 'r-markets',
        key: 'POST:/markets:shared-key',
      });

      idempotencyService.acquire
        .mockResolvedValueOnce({ acquired: true, record: predictionsRecord })
        .mockResolvedValueOnce({ acquired: true, record: marketsRecord });

      const handler1 = makeHandler({ route: 'predictions' });
      const handler2 = makeHandler({ route: 'markets' });

      const ctxPredictions = makeContext({
        idempotencyKey: 'shared-key',
        url: '/predictions',
        routePath: '/predictions',
        userId: 'user-1',
      });
      const ctxMarkets = makeContext({
        idempotencyKey: 'shared-key',
        url: '/markets',
        routePath: '/markets',
        userId: 'user-1',
      });

      const first$ = await interceptor.intercept(ctxPredictions, handler1);
      await new Promise<void>((resolve) => first$.subscribe(() => resolve()));

      const second$ = await interceptor.intercept(ctxMarkets, handler2);
      await new Promise<void>((resolve) => second$.subscribe(() => resolve()));

      expect(handler1.handle).toHaveBeenCalledTimes(1);
      expect(handler2.handle).toHaveBeenCalledTimes(1);

      // The stored key must differ between routes
      const [storedKey1] = idempotencyService.acquire.mock.calls[0];
      const [storedKey2] = idempotencyService.acquire.mock.calls[1];
      expect(storedKey1).not.toBe(storedKey2);
      expect(storedKey1).toContain('/predictions');
      expect(storedKey2).toContain('/markets');
    });
  });

  // -------------------------------------------------------------------------
  // 422 on same key + different body
  // -------------------------------------------------------------------------
  describe('same Idempotency-Key with a different request body', () => {
    it('throws 422 UnprocessableEntityException', async () => {
      const differentHash = makeHash('POST', '/predictions', { amount: 999 });
      const existingRecord = makeRecord({
        request_hash: differentHash,
        in_progress: false,
      });

      idempotencyService.acquire.mockResolvedValue({
        acquired: false,
        record: existingRecord,
      });

      const ctx = makeContext({
        idempotencyKey: 'idempotency-key-abc',
        body: { amount: 100 }, // body differs from the stored hash
      });

      await expect(
        interceptor.intercept(ctx, makeHandler()),
      ).rejects.toThrow(UnprocessableEntityException);
    });
  });

  // -------------------------------------------------------------------------
  // 409 when a concurrent request is in-progress
  // -------------------------------------------------------------------------
  describe('concurrent request with same Idempotency-Key still in progress', () => {
    it('throws 409 ConflictException', async () => {
      const hash = makeHash('POST', '/predictions', { amount: 100 });
      const inProgressRecord = makeRecord({
        request_hash: hash,
        in_progress: true,
        response_body: null,
        status_code: null,
      });

      idempotencyService.acquire.mockResolvedValue({
        acquired: false,
        record: inProgressRecord,
      });

      const ctx = makeContext({
        idempotencyKey: 'idempotency-key-abc',
        body: { amount: 100 },
      });

      await expect(
        interceptor.intercept(ctx, makeHandler()),
      ).rejects.toThrow(ConflictException);
    });
  });
});
