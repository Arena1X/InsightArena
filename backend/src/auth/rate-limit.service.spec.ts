import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerStorage } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import { RateLimitService } from './rate-limit.service';
import { RateLimitStatusDto } from './dto/rate-limit-status.dto';

describe('RateLimitService', () => {
  let service: RateLimitService;
  let throttlerStorage: jest.Mocked<ThrottlerStorage>;
  let configService: jest.Mocked<ConfigService>;

  beforeEach(async () => {
    throttlerStorage = {
      increment: jest.fn(),
    } as any;

    configService = {
      get: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RateLimitService,
        {
          provide: ThrottlerStorage,
          useValue: throttlerStorage,
        },
        {
          provide: ConfigService,
          useValue: configService,
        },
      ],
    }).compile();

    service = module.get<RateLimitService>(RateLimitService);
  });

  describe('constructor', () => {
    it('should load default tier configuration from config service', () => {
      expect(service).toBeDefined();
    });

    it('should use fallback values when config service returns undefined', () => {
      configService.get.mockReturnValue(undefined);

      const testModule = Test.createTestingModule({
        providers: [
          RateLimitService,
          {
            provide: ThrottlerStorage,
            useValue: throttlerStorage,
          },
          {
            provide: ConfigService,
            useValue: configService,
          },
        ],
      });

      expect(() => testModule.compile()).not.toThrow();
    });

    it('should apply custom tier limits from config', () => {
      const mockGet = jest.fn((key: string) => {
        const configMap: Record<string, number> = {
          'RATE_LIMIT_DEFAULT_LIMIT': 500,
          'RATE_LIMIT_AUTH_LIMIT': 20,
          'RATE_LIMIT_READ_LIMIT': 400,
          'RATE_LIMIT_WRITE_LIMIT': 50,
        };
        return configMap[key];
      });

      configService.get = mockGet;

      const testModule = Test.createTestingModule({
        providers: [
          RateLimitService,
          {
            provide: ThrottlerStorage,
            useValue: throttlerStorage,
          },
          {
            provide: ConfigService,
            useValue: configService,
          },
        ],
      });

      expect(() => testModule.compile()).not.toThrow();
    });
  });

  describe('getStatus', () => {
    it('should return status for all tiers', async () => {
      throttlerStorage.increment.mockResolvedValue({
        totalHits: 5,
        isBlocked: false,
      } as any);

      const result = await service.getStatus('user-123');

      expect(result).toBeDefined();
      expect(result).toHaveProperty('default');
      expect(result).toHaveProperty('auth');
      expect(result).toHaveProperty('read');
      expect(result).toHaveProperty('write');
    });

    it('should calculate remaining correctly', async () => {
      throttlerStorage.increment.mockResolvedValue({
        totalHits: 30,
        isBlocked: false,
      } as any);

      const result = await service.getStatus('user-123');

      // Default limit is 100, used is 30, so remaining should be 70
      expect(result.default.remaining).toBe(70);
    });

    it('should not allow negative remaining', async () => {
      throttlerStorage.increment.mockResolvedValue({
        totalHits: 150,
        isBlocked: true,
      } as any);

      const result = await service.getStatus('user-123');

      // Even if used > limit, remaining should be 0
      expect(result.default.remaining).toBe(0);
    });

    it('should set reset_at in the future', async () => {
      throttlerStorage.increment.mockResolvedValue({
        totalHits: 5,
        isBlocked: false,
      } as any);

      const beforeCall = Date.now();
      const result = await service.getStatus('user-123');
      const afterCall = Date.now();

      expect(result.default.reset_at.getTime()).toBeGreaterThan(afterCall);
      expect(result.default.reset_at.getTime()).toBeGreaterThanOrEqual(beforeCall);
    });

    it('should handle throttler storage errors gracefully', async () => {
      throttlerStorage.increment.mockRejectedValue(
        new Error('Storage error'),
      );

      const result = await service.getStatus('user-123');

      // Should default to 0 used and full remaining
      expect(result.default.remaining).toBe(100);
      expect(result.default.limit).toBe(100);
    });

    it('should call throttler storage once per tier', async () => {
      throttlerStorage.increment.mockResolvedValue({
        totalHits: 5,
        isBlocked: false,
      } as any);

      await service.getStatus('user-123');

      // Should be called 4 times (default, auth, read, write)
      expect(throttlerStorage.increment).toHaveBeenCalledTimes(4);
    });

    it('should use correct key format for throttler storage', async () => {
      throttlerStorage.increment.mockResolvedValue({
        totalHits: 5,
        isBlocked: false,
      } as any);

      await service.getStatus('user-123');

      const calls = throttlerStorage.increment.mock.calls;
      expect(calls[0][0]).toContain('throttle:default:user:user-123');
      expect(calls[1][0]).toContain('throttle:auth:user:user-123');
    });

    it('should return different status objects per tier', async () => {
      throttlerStorage.increment
        .mockResolvedValueOnce({ totalHits: 10, isBlocked: false } as any)
        .mockResolvedValueOnce({ totalHits: 5, isBlocked: false } as any)
        .mockResolvedValueOnce({ totalHits: 50, isBlocked: false } as any)
        .mockResolvedValueOnce({ totalHits: 20, isBlocked: false } as any);

      const result = await service.getStatus('user-123');

      expect(result.default.remaining).toBe(90);
      expect(result.auth.remaining).toBe(5);
      expect(result.read.remaining).toBe(150);
      expect(result.write.remaining).toBe(10);
    });

    it('should include limit in response', async () => {
      throttlerStorage.increment.mockResolvedValue({
        totalHits: 5,
        isBlocked: false,
      } as any);

      const result = await service.getStatus('user-123');

      expect(result.default.limit).toBe(100);
      expect(result.auth.limit).toBe(10);
      expect(result.read.limit).toBe(200);
      expect(result.write.limit).toBe(30);
    });
  });

  describe('getTierStatus', () => {
    it('should return status for specific tier', async () => {
      throttlerStorage.increment.mockResolvedValue({
        totalHits: 5,
        isBlocked: false,
      } as any);

      const result = await service.getTierStatus('user-123', 'auth');

      expect(result).toBeDefined();
      expect(result.limit).toBe(10);
      expect(result.remaining).toBe(5);
    });

    it('should use correct tier limit', async () => {
      throttlerStorage.increment.mockResolvedValue({
        totalHits: 25,
        isBlocked: false,
      } as any);

      const result = await service.getTierStatus('user-123', 'read');

      expect(result.limit).toBe(200);
      expect(result.remaining).toBe(175);
    });

    it('should use default tier for unknown tier name', async () => {
      throttlerStorage.increment.mockResolvedValue({
        totalHits: 5,
        isBlocked: false,
      } as any);

      const result = await service.getTierStatus('user-123', 'unknown-tier');

      expect(result.limit).toBe(100);
    });

    it('should set reset_at based on tier ttl', async () => {
      throttlerStorage.increment.mockResolvedValue({
        totalHits: 5,
        isBlocked: false,
      } as any);

      const beforeCall = Date.now();
      const result = await service.getTierStatus('user-123', 'auth');
      const afterCall = Date.now();

      expect(result.reset_at.getTime()).toBeGreaterThan(afterCall);
    });

    it('should handle storage errors', async () => {
      throttlerStorage.increment.mockRejectedValue(
        new Error('Storage error'),
      );

      const result = await service.getTierStatus('user-123', 'auth');

      expect(result.remaining).toBe(10);
      expect(result.limit).toBe(10);
    });

    it('should call throttler storage once for single tier', async () => {
      throttlerStorage.increment.mockResolvedValue({
        totalHits: 5,
        isBlocked: false,
      } as any);

      await service.getTierStatus('user-123', 'write');

      expect(throttlerStorage.increment).toHaveBeenCalledTimes(1);
    });

    it('should pass correct parameters to throttler storage', async () => {
      throttlerStorage.increment.mockResolvedValue({
        totalHits: 5,
        isBlocked: false,
      } as any);

      await service.getTierStatus('user-123', 'write');

      const call = throttlerStorage.increment.mock.calls[0];
      expect(call[0]).toContain('throttle:write:user:user-123');
      expect(call[2]).toBe(30); // limit
      expect(call[4]).toBe('write'); // tier name
    });
  });

  describe('RateLimitStatusDto', () => {
    it('should contain limit property', async () => {
      throttlerStorage.increment.mockResolvedValue({
        totalHits: 5,
        isBlocked: false,
      } as any);

      const result = await service.getTierStatus('user-123', 'default');

      expect(result).toHaveProperty('limit');
      expect(typeof result.limit).toBe('number');
    });

    it('should contain remaining property', async () => {
      throttlerStorage.increment.mockResolvedValue({
        totalHits: 5,
        isBlocked: false,
      } as any);

      const result = await service.getTierStatus('user-123', 'default');

      expect(result).toHaveProperty('remaining');
      expect(typeof result.remaining).toBe('number');
    });

    it('should contain reset_at property as Date', async () => {
      throttlerStorage.increment.mockResolvedValue({
        totalHits: 5,
        isBlocked: false,
      } as any);

      const result = await service.getTierStatus('user-123', 'default');

      expect(result).toHaveProperty('reset_at');
      expect(result.reset_at).toBeInstanceOf(Date);
    });
  });

  describe('edge cases', () => {
    it('should handle empty identifier string', async () => {
      throttlerStorage.increment.mockResolvedValue({
        totalHits: 5,
        isBlocked: false,
      } as any);

      const result = await service.getStatus('');

      expect(result).toBeDefined();
    });

    it('should handle very large hit counts', async () => {
      throttlerStorage.increment.mockResolvedValue({
        totalHits: 999999,
        isBlocked: true,
      } as any);

      const result = await service.getTierStatus('user-123', 'default');

      expect(result.remaining).toBe(0);
    });

    it('should handle zero hit count', async () => {
      throttlerStorage.increment.mockResolvedValue({
        totalHits: 0,
        isBlocked: false,
      } as any);

      const result = await service.getTierStatus('user-123', 'default');

      expect(result.remaining).toBe(100);
    });

    it('should handle multiple concurrent requests', async () => {
      throttlerStorage.increment.mockResolvedValue({
        totalHits: 5,
        isBlocked: false,
      } as any);

      const [result1, result2, result3] = await Promise.all([
        service.getTierStatus('user-1', 'default'),
        service.getTierStatus('user-2', 'default'),
        service.getTierStatus('user-3', 'default'),
      ]);

      expect(result1).toBeDefined();
      expect(result2).toBeDefined();
      expect(result3).toBeDefined();
    });
  });

  describe('tier configuration', () => {
    it('should have default tier config', async () => {
      throttlerStorage.increment.mockResolvedValue({
        totalHits: 0,
        isBlocked: false,
      } as any);

      const result = await service.getTierStatus('user-123', 'default');

      expect(result.limit).toBe(100);
    });

    it('should have auth tier config', async () => {
      throttlerStorage.increment.mockResolvedValue({
        totalHits: 0,
        isBlocked: false,
      } as any);

      const result = await service.getTierStatus('user-123', 'auth');

      expect(result.limit).toBe(10);
    });

    it('should have read tier config', async () => {
      throttlerStorage.increment.mockResolvedValue({
        totalHits: 0,
        isBlocked: false,
      } as any);

      const result = await service.getTierStatus('user-123', 'read');

      expect(result.limit).toBe(200);
    });

    it('should have write tier config', async () => {
      throttlerStorage.increment.mockResolvedValue({
        totalHits: 0,
        isBlocked: false,
      } as any);

      const result = await service.getTierStatus('user-123', 'write');

      expect(result.limit).toBe(30);
    });
  });
});
