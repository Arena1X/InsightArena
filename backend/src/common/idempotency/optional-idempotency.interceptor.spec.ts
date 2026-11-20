import { Test, TestingModule } from '@nestjs/testing';
import {
  ExecutionContext,
  ConflictException,
  UnprocessableEntityException,
  CallHandler,
} from '@nestjs/common';
import { OptionalIdempotencyInterceptor } from './optional-idempotency.interceptor';
import { IdempotencyService } from './idempotency.service';
import { of, throwError } from 'rxjs';
import { Request } from 'express';

describe('OptionalIdempotencyInterceptor', () => {
  let interceptor: OptionalIdempotencyInterceptor;
  let idempotencyService: jest.Mocked<IdempotencyService>;
  let mockContext: jest.Mocked<ExecutionContext>;
  let mockRequest: Partial<Request & { user?: { id: string } }>;
  let mockCallHandler: jest.Mocked<CallHandler>;

  const validUUID = '550e8400-e29b-41d4-a716-446655440000';
  const invalidUUID = 'not-a-uuid';
  const testUserId = 'user-123';

  beforeEach(async () => {
    idempotencyService = {
      acquire: jest.fn(),
      getKey: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OptionalIdempotencyInterceptor,
        {
          provide: IdempotencyService,
          useValue: idempotencyService,
        },
      ],
    }).compile();

    interceptor = module.get<OptionalIdempotencyInterceptor>(
      OptionalIdempotencyInterceptor,
    );

    mockRequest = {
      headers: {},
      method: 'POST',
      originalUrl: '/api/v1/predictions',
      body: { market_id: 'market-123', outcome: 'yes', amount: 100 },
      user: { id: testUserId },
    };

    mockContext = {
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue(mockRequest),
      }),
    } as any;

    mockCallHandler = {
      handle: jest.fn().mockReturnValue(of({ success: true })),
    } as any;
  });

  describe('constructor', () => {
    it('should be defined', () => {
      expect(interceptor).toBeDefined();
    });

    it('should have IdempotencyService injected', () => {
      expect(idempotencyService).toBeDefined();
    });
  });

  describe('intercept without idempotency header', () => {
    it('should pass through without header', async () => {
      mockRequest.headers = {};

      const result = await interceptor.intercept(mockContext, mockCallHandler);

      expect(result).toBeDefined();
      expect(mockCallHandler.handle).toHaveBeenCalled();
      expect(idempotencyService.acquire).not.toHaveBeenCalled();
    });

    it('should pass through with non-string header', async () => {
      mockRequest.headers = { 'idempotency-key': ['array'] };

      const result = await interceptor.intercept(mockContext, mockCallHandler);

      expect(mockCallHandler.handle).toHaveBeenCalled();
    });

    it('should call next.handle() for no idempotency header', async () => {
      const result = await interceptor.intercept(mockContext, mockCallHandler);

      expect(mockCallHandler.handle).toHaveBeenCalledTimes(1);
    });

    it('should return observable from next.handle()', async () => {
      const result = await interceptor.intercept(mockContext, mockCallHandler);

      expect(result).toEqual(of({ success: true }));
    });
  });

  describe('idempotency header validation', () => {
    it('should reject invalid UUID format', async () => {
      mockRequest.headers = { 'idempotency-key': invalidUUID };

      await expect(
        interceptor.intercept(mockContext, mockCallHandler),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('should reject UUID with wrong case in variant bits', async () => {
      mockRequest.headers = { 'idempotency-key': '550e8400-e29b-41d4-x716-446655440000' };

      await expect(
        interceptor.intercept(mockContext, mockCallHandler),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('should accept valid UUID v4', async () => {
      mockRequest.headers = { 'idempotency-key': validUUID };
      idempotencyService.acquire.mockResolvedValue({
        acquired: true,
        record: null,
      });

      const result = await interceptor.intercept(mockContext, mockCallHandler);

      expect(result).toBeDefined();
    });

    it('should accept valid UUID with uppercase', async () => {
      const uppercaseUUID = validUUID.toUpperCase();
      mockRequest.headers = { 'idempotency-key': uppercaseUUID };
      idempotencyService.acquire.mockResolvedValue({
        acquired: true,
        record: null,
      });

      const result = await interceptor.intercept(mockContext, mockCallHandler);

      expect(result).toBeDefined();
    });

    it('should reject UUID with incorrect length', async () => {
      mockRequest.headers = { 'idempotency-key': '550e8400-e29b-41d4-a716-44665544' };

      await expect(
        interceptor.intercept(mockContext, mockCallHandler),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('should reject UUID with non-hex characters', async () => {
      mockRequest.headers = { 'idempotency-key': '550e8400-e29b-41d4-a716-44665544ZZZZ' };

      await expect(
        interceptor.intercept(mockContext, mockCallHandler),
      ).rejects.toThrow(UnprocessableEntityException);
    });
  });

  describe('first request (acquired = true)', () => {
    it('should process normally when key is acquired', async () => {
      mockRequest.headers = { 'idempotency-key': validUUID };
      idempotencyService.acquire.mockResolvedValue({
        acquired: true,
        record: null,
      });

      await interceptor.intercept(mockContext, mockCallHandler);

      expect(mockCallHandler.handle).toHaveBeenCalled();
    });

    it('should call acquire with correct parameters', async () => {
      mockRequest.headers = { 'idempotency-key': validUUID };
      idempotencyService.acquire.mockResolvedValue({
        acquired: true,
        record: null,
      });

      await interceptor.intercept(mockContext, mockCallHandler);

      expect(idempotencyService.acquire).toHaveBeenCalledWith(
        validUUID,
        testUserId,
        expect.any(String),
      );
    });

    it('should include request method in hash', async () => {
      mockRequest.headers = { 'idempotency-key': validUUID };
      mockRequest.method = 'POST';
      idempotencyService.acquire.mockResolvedValue({
        acquired: true,
        record: null,
      });

      await interceptor.intercept(mockContext, mockCallHandler);

      const callArgs = (idempotencyService.acquire as jest.Mock).mock.calls[0];
      expect(callArgs[2]).toContain('POST');
    });

    it('should include URL in hash', async () => {
      mockRequest.headers = { 'idempotency-key': validUUID };
      mockRequest.originalUrl = '/api/v1/predictions';
      idempotencyService.acquire.mockResolvedValue({
        acquired: true,
        record: null,
      });

      await interceptor.intercept(mockContext, mockCallHandler);

      const callArgs = (idempotencyService.acquire as jest.Mock).mock.calls[0];
      expect(callArgs[2]).toContain('/api/v1/predictions');
    });

    it('should include body in hash', async () => {
      mockRequest.headers = { 'idempotency-key': validUUID };
      mockRequest.body = { test: 'data' };
      idempotencyService.acquire.mockResolvedValue({
        acquired: true,
        record: null,
      });

      await interceptor.intercept(mockContext, mockCallHandler);

      const callArgs = (idempotencyService.acquire as jest.Mock).mock.calls[0];
      expect(callArgs[2]).toContain('data');
    });

    it('should handle undefined body', async () => {
      mockRequest.headers = { 'idempotency-key': validUUID };
      mockRequest.body = undefined;
      idempotencyService.acquire.mockResolvedValue({
        acquired: true,
        record: null,
      });

      await interceptor.intercept(mockContext, mockCallHandler);

      const callArgs = (idempotencyService.acquire as jest.Mock).mock.calls[0];
      expect(callArgs[2]).toContain('{}');
    });

    it('should use anonymous user when user is not present', async () => {
      mockRequest.headers = { 'idempotency-key': validUUID };
      mockRequest.user = undefined;
      idempotencyService.acquire.mockResolvedValue({
        acquired: true,
        record: null,
      });

      await interceptor.intercept(mockContext, mockCallHandler);

      const callArgs = (idempotencyService.acquire as jest.Mock).mock.calls[0];
      expect(callArgs[1]).toBe('anonymous');
    });
  });

  describe('replayed request (acquired = false)', () => {
    it('should return cached response on replay', async () => {
      mockRequest.headers = { 'idempotency-key': validUUID };
      const cachedResponse = { id: 'prediction-1', success: true };
      idempotencyService.acquire.mockResolvedValue({
        acquired: false,
        record: {
          idempotency_key: validUUID,
          user_id: testUserId,
          request_hash: 'hash',
          response: cachedResponse,
          status_code: 201,
          created_at: new Date(),
        },
      });

      const result = await interceptor.intercept(mockContext, mockCallHandler);

      expect(mockCallHandler.handle).not.toHaveBeenCalled();
    });

    it('should reject replay with different body', async () => {
      mockRequest.headers = { 'idempotency-key': validUUID };
      const differentHash = 'different-hash';
      idempotencyService.acquire.mockResolvedValue({
        acquired: false,
        record: {
          idempotency_key: validUUID,
          user_id: testUserId,
          request_hash: differentHash,
          response: {},
          status_code: 201,
        },
      });

      await expect(
        interceptor.intercept(mockContext, mockCallHandler),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('should include body mismatch error message', async () => {
      mockRequest.headers = { 'idempotency-key': validUUID };
      idempotencyService.acquire.mockResolvedValue({
        acquired: false,
        record: {
          idempotency_key: validUUID,
          user_id: testUserId,
          request_hash: 'different-hash',
          response: {},
          status_code: 201,
        },
      });

      await expect(
        interceptor.intercept(mockContext, mockCallHandler),
      ).rejects.toThrow('different request body');
    });
  });

  describe('per-user key scoping', () => {
    it('should allow same UUID for different users', async () => {
      mockRequest.headers = { 'idempotency-key': validUUID };
      mockRequest.user = { id: 'user-1' };
      idempotencyService.acquire.mockResolvedValue({
        acquired: true,
        record: null,
      });

      await interceptor.intercept(mockContext, mockCallHandler);

      expect(idempotencyService.acquire).toHaveBeenCalledWith(
        validUUID,
        'user-1',
        expect.any(String),
      );

      // Different user with same UUID
      mockRequest.user = { id: 'user-2' };
      idempotencyService.acquire.mockClear();
      idempotencyService.acquire.mockResolvedValue({
        acquired: true,
        record: null,
      });

      await interceptor.intercept(mockContext, mockCallHandler);

      expect(idempotencyService.acquire).toHaveBeenCalledWith(
        validUUID,
        'user-2',
        expect.any(String),
      );
    });
  });

  describe('hash computation', () => {
    it('should generate consistent hash for same request', async () => {
      mockRequest.headers = { 'idempotency-key': validUUID };
      idempotencyService.acquire.mockResolvedValue({
        acquired: true,
        record: null,
      });

      await interceptor.intercept(mockContext, mockCallHandler);
      const firstHash = (idempotencyService.acquire as jest.Mock).mock.calls[0][2];

      idempotencyService.acquire.mockClear();
      idempotencyService.acquire.mockResolvedValue({
        acquired: true,
        record: null,
      });

      await interceptor.intercept(mockContext, mockCallHandler);
      const secondHash = (idempotencyService.acquire as jest.Mock).mock.calls[0][2];

      expect(firstHash).toBe(secondHash);
    });

    it('should generate different hash for different body', async () => {
      mockRequest.headers = { 'idempotency-key': validUUID };
      mockRequest.body = { test: 'data1' };
      idempotencyService.acquire.mockResolvedValue({
        acquired: true,
        record: null,
      });

      await interceptor.intercept(mockContext, mockCallHandler);
      const hash1 = (idempotencyService.acquire as jest.Mock).mock.calls[0][2];

      idempotencyService.acquire.mockClear();
      mockRequest.body = { test: 'data2' };
      idempotencyService.acquire.mockResolvedValue({
        acquired: true,
        record: null,
      });

      await interceptor.intercept(mockContext, mockCallHandler);
      const hash2 = (idempotencyService.acquire as jest.Mock).mock.calls[0][2];

      expect(hash1).not.toBe(hash2);
    });

    it('should generate different hash for different URL', async () => {
      mockRequest.headers = { 'idempotency-key': validUUID };
      mockRequest.originalUrl = '/api/v1/predictions';
      idempotencyService.acquire.mockResolvedValue({
        acquired: true,
        record: null,
      });

      await interceptor.intercept(mockContext, mockCallHandler);
      const hash1 = (idempotencyService.acquire as jest.Mock).mock.calls[0][2];

      idempotencyService.acquire.mockClear();
      mockRequest.originalUrl = '/api/v1/markets';
      idempotencyService.acquire.mockResolvedValue({
        acquired: true,
        record: null,
      });

      await interceptor.intercept(mockContext, mockCallHandler);
      const hash2 = (idempotencyService.acquire as jest.Mock).mock.calls[0][2];

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('edge cases', () => {
    it('should handle empty body', async () => {
      mockRequest.headers = { 'idempotency-key': validUUID };
      mockRequest.body = {};
      idempotencyService.acquire.mockResolvedValue({
        acquired: true,
        record: null,
      });

      const result = await interceptor.intercept(mockContext, mockCallHandler);

      expect(result).toBeDefined();
    });

    it('should handle null body', async () => {
      mockRequest.headers = { 'idempotency-key': validUUID };
      mockRequest.body = null;
      idempotencyService.acquire.mockResolvedValue({
        acquired: true,
        record: null,
      });

      const result = await interceptor.intercept(mockContext, mockCallHandler);

      expect(result).toBeDefined();
    });

    it('should handle large request body', async () => {
      mockRequest.headers = { 'idempotency-key': validUUID };
      mockRequest.body = { data: 'x'.repeat(10000) };
      idempotencyService.acquire.mockResolvedValue({
        acquired: true,
        record: null,
      });

      const result = await interceptor.intercept(mockContext, mockCallHandler);

      expect(result).toBeDefined();
    });

    it('should be async', () => {
      expect(interceptor.intercept.constructor.name).toBe('AsyncFunction');
    });
  });
});
