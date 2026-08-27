import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  CallHandler,
  ConflictException,
  ExecutionContext,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { of } from 'rxjs';
import { IdempotencyInterceptor } from './idempotency.interceptor';
import { IdempotencyService } from './idempotency.service';

describe('IdempotencyInterceptor', () => {
  let interceptor: IdempotencyInterceptor;
  let idempotencyService: {
    acquire: jest.Mock;
    complete: jest.Mock;
    release: jest.Mock;
  };

  beforeEach(async () => {
    idempotencyService = {
      acquire: jest.fn(),
      complete: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
    };
    const module = await Test.createTestingModule({
      providers: [
        IdempotencyInterceptor,
        { provide: IdempotencyService, useValue: idempotencyService },
      ],
    }).compile();
    interceptor = module.get(IdempotencyInterceptor);
  });

  function contextWith(
    key: string | undefined,
    body: unknown,
  ): ExecutionContext {
    const request = {
      headers: { 'idempotency-key': key },
      method: 'POST',
      originalUrl: '/predictions',
      body,
      user: { id: 'user-1' },
    };
    return {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => ({ statusCode: 201 }),
      }),
    } as unknown as ExecutionContext;
  }

  it('throws 400 when the Idempotency-Key header is missing', async () => {
    const next: CallHandler = { handle: () => of('unused') };

    await expect(
      interceptor.intercept(contextWith(undefined, { a: 1 }), next),
    ).rejects.toThrow(BadRequestException);
  });

  it('returns 409 when the same key is reused with a different request body', async () => {
    idempotencyService.acquire.mockResolvedValue({
      acquired: false,
      record: {
        id: '1',
        request_hash: 'different-hash',
        in_progress: false,
        response_body: {},
      },
    });
    const next: CallHandler = { handle: () => of('unused') };

    await expect(
      interceptor.intercept(contextWith('key-1', { a: 1 }), next),
    ).rejects.toThrow(ConflictException);
  });

  it('returns 409 when a request with the same key and same body is already in progress', async () => {
    const expectedHash = createHash('sha256')
      .update(`POST:/predictions:${JSON.stringify({ a: 1 })}`)
      .digest('hex');
    idempotencyService.acquire.mockResolvedValue({
      acquired: false,
      record: {
        id: '1',
        request_hash: expectedHash,
        in_progress: true,
        response_body: null,
      },
    });
    const next: CallHandler = { handle: () => of('unused') };

    await expect(
      interceptor.intercept(contextWith('key-1', { a: 1 }), next),
    ).rejects.toThrow(ConflictException);
  });

  it('replays the stored response for a completed duplicate with a matching body', async () => {
    const expectedHash = createHash('sha256')
      .update(`POST:/predictions:${JSON.stringify({ a: 1 })}`)
      .digest('hex');
    idempotencyService.acquire.mockResolvedValue({
      acquired: false,
      record: {
        id: '1',
        request_hash: expectedHash,
        in_progress: false,
        response_body: { cached: true },
      },
    });
    const next: CallHandler = { handle: () => of('unused') };

    const result$ = await interceptor.intercept(
      contextWith('key-1', { a: 1 }),
      next,
    );
    const value = await new Promise((resolve) => {
      result$.subscribe((v) => resolve(v));
    });

    expect(value).toEqual({ cached: true });
  });
});
