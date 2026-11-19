import { Test } from '@nestjs/testing';
import {
  CallHandler,
  ConflictException,
  ExecutionContext,
  UnprocessableEntityException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { of, throwError } from 'rxjs';
import { OptionalIdempotencyInterceptor } from './optional-idempotency.interceptor';
import { IdempotencyService } from './idempotency.service';

describe('OptionalIdempotencyInterceptor', () => {
  let interceptor: OptionalIdempotencyInterceptor;
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
        OptionalIdempotencyInterceptor,
        { provide: IdempotencyService, useValue: idempotencyService },
      ],
    }).compile();

    interceptor = module.get(OptionalIdempotencyInterceptor);
  });

  function contextWith(
    idempotencyKey: string | undefined,
    body: unknown,
    userId?: string,
  ): ExecutionContext {
    const headers: Record<string, string> = {};
    if (idempotencyKey) {
      headers['idempotency-key'] = idempotencyKey;
    }

    const request = {
      headers,
      method: 'POST',
      originalUrl: '/api/predict',
      body,
      user: userId ? { id: userId } : undefined,
    };

    const response = {
      statusCode: 200,
      setHeader: jest.fn(),
    };

    return {
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue(request),
        getResponse: jest.fn().mockReturnValue(response),
      }),
    } as unknown as ExecutionContext;
  }

  describe('intercept', () => {
    it('should be defined', () => {
      expect(interceptor).toBeDefined();
    });

    it('should pass through when no idempotency header is present', async () => {
      const context = contextWith(undefined, { data: 'test' });
      const next = { handle: jest.fn().mockReturnValue(of({ result: 'ok' })) };

      const result = await interceptor.intercept(context, next as CallHandler);

      expect(result).toBeDefined();
      expect(idempotencyService.acquire).not.toHaveBeenCalled();
    });

    it('should reject invalid UUID in idempotency key', async () => {
      const context = contextWith('not-a-uuid', { data: 'test' });
      const next = { handle: jest.fn() };

      await expect(interceptor.intercept(context, next as CallHandler)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('should reject non-UUID string in idempotency key', async () => {
      const context = contextWith('12345', { data: 'test' });
      const next = { handle: jest.fn() };

      await expect(interceptor.intercept(context, next as CallHandler)).rejects.toThrow(
        'must be a valid UUID',
      );
    });

    it('should accept valid UUID in idempotency key', async () => {
      const validUuid = '550e8400-e29b-41d4-a716-446655440000';
      const context = contextWith(validUuid, { data: 'test' });
      const next = { handle: jest.fn().mockReturnValue(of({ result: 'ok' })) };

      idempotencyService.acquire.mockResolvedValue({
        acquired: true,
        record: { id: 'rec-1', in_progress: false, request_hash: 'hash' },
      });

      await interceptor.intercept(context, next as CallHandler);

      expect(idempotencyService.acquire).toHaveBeenCalled();
    });

    it('should use anonymous user when user not present', async () => {
      const validUuid = '550e8400-e29b-41d4-a716-446655440000';
      const context = contextWith(validUuid, { data: 'test' });
      const next = { handle: jest.fn().mockReturnValue(of({ result: 'ok' })) };

      idempotencyService.acquire.mockResolvedValue({
        acquired: true,
        record: { id: 'rec-1', in_progress: false, request_hash: 'hash' },
      });

      await interceptor.intercept(context, next as CallHandler);

      expect(idempotencyService.acquire).toHaveBeenCalledWith(
        validUuid,
        'anonymous',
        expect.any(String),
      );
    });

    it('should use user ID when present', async () => {
      const validUuid = '550e8400-e29b-41d4-a716-446655440000';
      const userId = 'user-123';
      const context = contextWith(validUuid, { data: 'test' }, userId);
      const next = { handle: jest.fn().mockReturnValue(of({ result: 'ok' })) };

      idempotencyService.acquire.mockResolvedValue({
        acquired: true,
        record: { id: 'rec-1', in_progress: false, request_hash: 'hash' },
      });

      await interceptor.intercept(context, next as CallHandler);

      expect(idempotencyService.acquire).toHaveBeenCalledWith(
        validUuid,
        userId,
        expect.any(String),
      );
    });

    it('should reject different body with same key', async () => {
      const validUuid = '550e8400-e29b-41d4-a716-446655440000';
      const context = contextWith(validUuid, { data: 'test' });
      const next = { handle: jest.fn() };

      const differentHash = 'different-hash';
      idempotencyService.acquire.mockResolvedValue({
        acquired: false,
        record: {
          id: 'rec-1',
          in_progress: false,
          request_hash: differentHash,
          response_body: { result: 'cached' },
          status_code: 200,
        },
      });

      await expect(interceptor.intercept(context, next as CallHandler)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('should reject request in progress with same key', async () => {
      const validUuid = '550e8400-e29b-41d4-a716-446655440000';
      const context = contextWith(validUuid, { data: 'test' });
      const next = { handle: jest.fn() };

      const requestHash = createHash('sha256')
        .update('POST:/api/predict:{"data":"test"}')
        .digest('hex');

      idempotencyService.acquire.mockResolvedValue({
        acquired: false,
        record: {
          id: 'rec-1',
          in_progress: true,
          request_hash: requestHash,
          response_body: null,
          status_code: null,
        },
      });

      await expect(interceptor.intercept(context, next as CallHandler)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should return cached response on replay', async () => {
      const validUuid = '550e8400-e29b-41d4-a716-446655440000';
      const context = contextWith(validUuid, { data: 'test' });
      const next = { handle: jest.fn() };

      const cachedResponse = { result: 'cached' };
      const requestHash = createHash('sha256')
        .update('POST:/api/predict:{"data":"test"}')
        .digest('hex');

      idempotencyService.acquire.mockResolvedValue({
        acquired: false,
        record: {
          id: 'rec-1',
          in_progress: false,
          request_hash: requestHash,
          response_body: cachedResponse,
          status_code: 200,
        },
      });

      const result = await interceptor.intercept(context, next as CallHandler);

      expect(result).toBeDefined();
    });

    it('should complete request on success', async () => {
      const validUuid = '550e8400-e29b-41d4-a716-446655440000';
      const context = contextWith(validUuid, { data: 'test' });
      const responseData = { result: 'ok' };
      const next = {
        handle: jest.fn().mockReturnValue(of(responseData)),
      };

      idempotencyService.acquire.mockResolvedValue({
        acquired: true,
        record: { id: 'rec-1', in_progress: false, request_hash: 'hash' },
      });

      await new Promise((resolve) => {
        const result = interceptor.intercept(context, next as CallHandler);
        result.then((observable) => {
          observable.subscribe(() => resolve(null));
        });
      });

      expect(idempotencyService.complete).toHaveBeenCalled();
    });

    it('should release on error', async () => {
      const validUuid = '550e8400-e29b-41d4-a716-446655440000';
      const context = contextWith(validUuid, { data: 'test' });
      const error = new Error('Request failed');
      const next = {
        handle: jest.fn().mockReturnValue(throwError(() => error)),
      };

      idempotencyService.acquire.mockResolvedValue({
        acquired: true,
        record: { id: 'rec-1', in_progress: false, request_hash: 'hash' },
      });

      const result = await interceptor.intercept(context, next as CallHandler);

      await new Promise((resolve, reject) => {
        result.subscribe({
          next: () => reject(new Error('Should have thrown')),
          error: () => resolve(null),
        });
      });

      expect(idempotencyService.release).toHaveBeenCalled();
    });

    it('should set replay header on cached response', async () => {
      const validUuid = '550e8400-e29b-41d4-a716-446655440000';
      const context = contextWith(validUuid, { data: 'test' });
      const response = { statusCode: 200, setHeader: jest.fn() };
      
      jest.spyOn(context.switchToHttp(), 'getResponse').mockReturnValue(response);

      const requestHash = createHash('sha256')
        .update('POST:/api/predict:{"data":"test"}')
        .digest('hex');

      idempotencyService.acquire.mockResolvedValue({
        acquired: false,
        record: {
          id: 'rec-1',
          in_progress: false,
          request_hash: requestHash,
          response_body: { result: 'cached' },
          status_code: 200,
        },
      });

      const next = { handle: jest.fn() };

      await interceptor.intercept(context, next as CallHandler);

      expect(response.setHeader).toHaveBeenCalledWith(
        'idempotency-replayed',
        'true',
      );
    });
  });
});
