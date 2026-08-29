import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ThrottlerStorage } from '@nestjs/throttler';
import { PredictionsRateLimitGuard } from './predictions-rate-limit.guard';

describe('PredictionsRateLimitGuard', () => {
  let guard: PredictionsRateLimitGuard;
  let mockThrottlerStorage: jest.Mocked<ThrottlerStorage>;
  let mockConfigService: jest.Mocked<ConfigService>;
  let mockJwtService: jest.Mocked<JwtService>;
  let mockContext: jest.Mocked<ExecutionContext>;

  beforeEach(async () => {
    mockThrottlerStorage = {
      increment: jest.fn(),
    } as unknown as jest.Mocked<ThrottlerStorage>;

    mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'PREDICTIONS_RATE_LIMIT') return 30;
        if (key === 'PREDICTIONS_RATE_LIMIT_WINDOW_MS') return 60_000;
        return undefined;
      }),
    } as unknown as jest.Mocked<ConfigService>;

    mockJwtService = {
      decode: jest.fn(),
    } as unknown as jest.Mocked<JwtService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PredictionsRateLimitGuard,
        { provide: ThrottlerStorage, useValue: mockThrottlerStorage },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: JwtService, useValue: mockJwtService },
      ],
    }).compile();

    guard = module.get<PredictionsRateLimitGuard>(PredictionsRateLimitGuard);
  });

  describe('canActivate', () => {
    beforeEach(() => {
      mockContext = {
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue({
            headers: {
              authorization: 'Bearer valid-token',
            },
          }),
          getResponse: jest.fn().mockReturnValue({}),
        }),
      } as unknown as jest.Mocked<ExecutionContext>;
    });

    it('allows request when user is under rate limit', async () => {
      mockJwtService.decode.mockReturnValue({ sub: 'user-123' });
      mockThrottlerStorage.increment.mockResolvedValue({
        totalHits: 5,
        timeToExpire: 50,
      } as any);

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(true);
      expect(mockThrottlerStorage.increment).toHaveBeenCalled();
    });

    it('blocks request with 429 when rate limit is exceeded', async () => {
      mockJwtService.decode.mockReturnValue({ sub: 'user-123' });
      mockThrottlerStorage.increment.mockResolvedValue({
        totalHits: 31, // Exceeds default limit of 30
        timeToExpire: 50,
      } as any);

      await expect(guard.canActivate(mockContext)).rejects.toThrow(
        HttpException,
      );
      expect(mockThrottlerStorage.increment).toHaveBeenCalled();
    });

    it('allows unauthenticated requests (passes through)', async () => {
      const contextNoAuth = {
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue({
            headers: {},
          }),
          getResponse: jest.fn().mockReturnValue({}),
        }),
      } as unknown as jest.Mocked<ExecutionContext>;

      const result = await guard.canActivate(contextNoAuth);

      expect(result).toBe(true);
      expect(mockThrottlerStorage.increment).not.toHaveBeenCalled();
    });

    it('extracts user ID from JWT token correctly', async () => {
      mockJwtService.decode.mockReturnValue({ sub: 'user-456' });
      mockThrottlerStorage.increment.mockResolvedValue({
        totalHits: 10,
        timeToExpire: 50,
      } as any);

      await guard.canActivate(mockContext);

      expect(mockThrottlerStorage.increment).toHaveBeenCalledWith(
        'predictions_rate_limit:user-456',
        60_000,
        30,
        30,
        'predictions',
      );
    });

    it('sets rate-limit headers on response', async () => {
      const mockResponse = {
        setHeader: jest.fn(),
      };
      const contextWithResponse = {
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue({
            headers: {
              authorization: 'Bearer valid-token',
            },
          }),
          getResponse: jest.fn().mockReturnValue(mockResponse),
        }),
      } as unknown as jest.Mocked<ExecutionContext>;

      mockJwtService.decode.mockReturnValue({ sub: 'user-123' });
      mockThrottlerStorage.increment.mockResolvedValue({
        totalHits: 5,
        timeToExpire: 50,
      } as any);

      await guard.canActivate(contextWithResponse);

      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'X-RateLimit-Limit',
        '30',
      );
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'X-RateLimit-Remaining',
        '25',
      );
    });

    it('returns 429 error message with rate limit info', async () => {
      mockJwtService.decode.mockReturnValue({ sub: 'user-123' });
      mockThrottlerStorage.increment.mockResolvedValue({
        totalHits: 31,
        timeToExpire: 45,
      } as any);

      const error = await guard.canActivate(mockContext).catch((e) => e);

      expect(error).toBeInstanceOf(HttpException);
      expect(error.message).toContain('Rate limit exceeded');
      expect(error.message).toContain('30');
    });

    it('respects custom rate limit configuration', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'PREDICTIONS_RATE_LIMIT') return 50;
        if (key === 'PREDICTIONS_RATE_LIMIT_WINDOW_MS') return 120_000;
        return undefined;
      });

      const moduleWithCustomConfig: TestingModule =
        await Test.createTestingModule({
          providers: [
            PredictionsRateLimitGuard,
            { provide: ThrottlerStorage, useValue: mockThrottlerStorage },
            { provide: ConfigService, useValue: mockConfigService },
            { provide: JwtService, useValue: mockJwtService },
          ],
        }).compile();

      const customGuard = moduleWithCustomConfig.get<PredictionsRateLimitGuard>(
        PredictionsRateLimitGuard,
      );

      mockJwtService.decode.mockReturnValue({ sub: 'user-123' });
      mockThrottlerStorage.increment.mockResolvedValue({
        totalHits: 40,
        timeToExpire: 90,
      } as any);

      const result = await customGuard.canActivate(mockContext);

      expect(result).toBe(true);
      expect(mockThrottlerStorage.increment).toHaveBeenCalledWith(
        'predictions_rate_limit:user-123',
        120_000,
        50,
        50,
        'predictions',
      );
    });

    it('handles storage errors gracefully (does not block)', async () => {
      mockJwtService.decode.mockReturnValue({ sub: 'user-123' });
      mockThrottlerStorage.increment.mockRejectedValue(
        new Error('Storage error'),
      );

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(true);
    });
  });

  describe('JWT token extraction', () => {
    it('handles invalid JWT tokens gracefully', async () => {
      mockJwtService.decode.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      const contextWithInvalidToken = {
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue({
            headers: {
              authorization: 'Bearer invalid-token',
            },
          }),
          getResponse: jest.fn().mockReturnValue({}),
        }),
      } as unknown as jest.Mocked<ExecutionContext>;

      const result = await guard.canActivate(contextWithInvalidToken);

      expect(result).toBe(true);
      expect(mockThrottlerStorage.increment).not.toHaveBeenCalled();
    });

    it('handles missing sub claim in JWT', async () => {
      mockJwtService.decode.mockReturnValue({ aud: 'api' });

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(true);
      expect(mockThrottlerStorage.increment).not.toHaveBeenCalled();
    });

    it('ignores malformed authorization header', async () => {
      const contextWithMalformedAuth = {
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue({
            headers: {
              authorization: 'InvalidFormat token-here',
            },
          }),
          getResponse: jest.fn().mockReturnValue({}),
        }),
      } as unknown as jest.Mocked<ExecutionContext>;

      const result = await guard.canActivate(contextWithMalformedAuth);

      expect(result).toBe(true);
      expect(mockThrottlerStorage.increment).not.toHaveBeenCalled();
    });
  });
});
