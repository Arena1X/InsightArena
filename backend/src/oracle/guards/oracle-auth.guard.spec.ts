import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OracleAuthGuard } from './oracle-auth.guard';
import { Request } from 'express';

describe('OracleAuthGuard', () => {
  let guard: OracleAuthGuard;
  let configService: jest.Mocked<ConfigService>;
  let mockExecutionContext: jest.Mocked<ExecutionContext>;
  let mockRequest: Partial<Request>;

  beforeEach(async () => {
    configService = {
      get: jest.fn(),
    } as any;

    mockExecutionContext = {
      switchToHttp: jest.fn(),
    } as any;

    mockRequest = {
      headers: {},
      method: 'GET',
      url: '/api/v1/oracle/pending-matches',
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OracleAuthGuard,
        {
          provide: ConfigService,
          useValue: configService,
        },
      ],
    }).compile();

    guard = module.get<OracleAuthGuard>(OracleAuthGuard);

    // Setup default config behavior
    (configService.get as jest.Mock).mockImplementation((key: string, defaultValue?: string) => {
      const config: Record<string, string> = {
        ORACLE_API_KEY: 'test-api-key',
        AI_AGENT_ADDRESS: 'GBXA6SA2UJQAHG2BNBZAZXQEOTDVMVKYDVUQB7OGSHM2TQCJ2PXJZMY',
        NODE_ENV: 'development',
      };
      return config[key] || defaultValue;
    });

    mockExecutionContext.switchToHttp.mockReturnValue({
      getRequest: jest.fn().mockReturnValue(mockRequest),
    } as any);
  });

  describe('constructor', () => {
    it('should be defined', () => {
      expect(guard).toBeDefined();
    });

    it('should load ORACLE_API_KEY from config', () => {
      expect(configService.get).toHaveBeenCalledWith('ORACLE_API_KEY');
    });

    it('should load AI_AGENT_ADDRESS from config', () => {
      expect(configService.get).toHaveBeenCalledWith('AI_AGENT_ADDRESS');
    });

    it('should load NODE_ENV from config', () => {
      expect(configService.get).toHaveBeenCalledWith('NODE_ENV', 'development');
    });

    it('should initialize rate limit tracking map', () => {
      expect(guard).toHaveProperty('requestCounts');
    });
  });

  describe('canActivate', () => {
    it('should be defined', () => {
      expect(guard.canActivate).toBeDefined();
    });

    it('should return true for valid development environment with correct API key', async () => {
      mockRequest.headers = { 'x-api-key': 'test-api-key' };

      const result = await guard.canActivate(mockExecutionContext);

      expect(result).toBe(true);
    });

    it('should throw UnauthorizedException for missing API key in development', async () => {
      mockRequest.headers = {};

      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException for invalid API key', async () => {
      mockRequest.headers = { 'x-api-key': 'wrong-api-key' };

      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should log oracle API call details', async () => {
      mockRequest.headers = { 'x-api-key': 'test-api-key' };
      const loggerSpy = jest.spyOn(guard['logger'], 'log');

      await guard.canActivate(mockExecutionContext);

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('Oracle API call from:'),
      );
    });

    it('should extract x-caller-address from headers', async () => {
      mockRequest.headers = {
        'x-api-key': 'test-api-key',
        'x-caller-address': 'GBRPYHIL2CI3WHZDTOOQFC6EB4RRJC3XNRBF7XN',
      };

      const result = await guard.canActivate(mockExecutionContext);

      expect(result).toBe(true);
    });

    it('should be an async function', () => {
      expect(guard.canActivate.constructor.name).toBe('AsyncFunction');
    });
  });

  describe('rate limiting', () => {
    it('should allow requests under the limit', async () => {
      mockRequest.headers = { 'x-api-key': 'test-api-key' };

      const promises = Array(50)
        .fill(null)
        .map(() => guard.canActivate(mockExecutionContext));

      const results = await Promise.all(promises);

      expect(results.every((r) => r === true)).toBe(true);
    });

    it('should block requests exceeding the rate limit', async () => {
      mockRequest.headers = { 'x-api-key': 'test-api-key' };

      // First, exhaust the limit (100 requests)
      for (let i = 0; i < 100; i++) {
        await guard.canActivate(mockExecutionContext);
      }

      // Next request should fail
      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should track rate limits per caller address', async () => {
      mockRequest.headers = { 'x-api-key': 'test-api-key' };

      // First caller makes requests
      for (let i = 0; i < 50; i++) {
        await guard.canActivate(mockExecutionContext);
      }

      // Different caller should have separate limit
      mockRequest.headers = {
        'x-api-key': 'test-api-key',
        'x-caller-address': 'different-address',
      };

      for (let i = 0; i < 50; i++) {
        const result = await guard.canActivate(mockExecutionContext);
        expect(result).toBe(true);
      }
    });

    it('should warn when rate limit is exceeded', async () => {
      mockRequest.headers = { 'x-api-key': 'test-api-key' };
      const warnSpy = jest.spyOn(guard['logger'], 'warn');

      // Exhaust limit
      for (let i = 0; i < 100; i++) {
        await guard.canActivate(mockExecutionContext);
      }

      // Attempt to exceed
      try {
        await guard.canActivate(mockExecutionContext);
      } catch (e) {
        // Expected
      }

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Rate limit exceeded'),
      );
    });

    it('should reset rate limit after time window expires', async () => {
      mockRequest.headers = { 'x-api-key': 'test-api-key' };
      const identifier = 'unknown';

      // Fill up rate limit
      for (let i = 0; i < 100; i++) {
        await guard.canActivate(mockExecutionContext);
      }

      // Should be rate limited
      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow();

      // Manually advance time and clear the old record
      const record = guard['requestCounts'].get(identifier);
      if (record) {
        record.resetTime = Date.now() - 1; // Make it expired
      }

      // Should allow again
      const result = await guard.canActivate(mockExecutionContext);
      expect(result).toBe(true);
    });

    it('should use 100 requests per minute limit', () => {
      expect(guard['RATE_LIMIT_MAX']).toBe(100);
    });

    it('should use 60 second window for rate limiting', () => {
      expect(guard['RATE_LIMIT_WINDOW']).toBe(60000);
    });
  });

  describe('API key verification (development environment)', () => {
    beforeEach(() => {
      (configService.get as jest.Mock).mockImplementation((key: string, defaultValue?: string) => {
        const config: Record<string, string> = {
          ORACLE_API_KEY: 'test-api-key',
          NODE_ENV: 'development',
        };
        return config[key] || defaultValue;
      });

      guard = new OracleAuthGuard(configService);
      mockExecutionContext.switchToHttp.mockReturnValue({
        getRequest: jest.fn().mockReturnValue(mockRequest),
      } as any);
    });

    it('should require x-api-key header', async () => {
      mockRequest.headers = {};

      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
        'Invalid or missing API key',
      );
    });

    it('should accept valid API key', async () => {
      mockRequest.headers = { 'x-api-key': 'test-api-key' };

      const result = await guard.canActivate(mockExecutionContext);

      expect(result).toBe(true);
    });

    it('should reject mismatched API key', async () => {
      mockRequest.headers = { 'x-api-key': 'wrong-key' };

      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw error when ORACLE_API_KEY is not configured', async () => {
      (configService.get as jest.Mock).mockImplementation((key: string) => {
        if (key === 'ORACLE_API_KEY') return undefined;
        if (key === 'NODE_ENV') return 'development';
        return undefined;
      });

      guard = new OracleAuthGuard(configService);
      mockExecutionContext.switchToHttp.mockReturnValue({
        getRequest: jest.fn().mockReturnValue(mockRequest),
      } as any);

      mockRequest.headers = { 'x-api-key': 'any-key' };

      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
        'Oracle API key not configured',
      );
    });
  });

  describe('request logging', () => {
    it('should log caller address when present', async () => {
      mockRequest.headers = {
        'x-api-key': 'test-api-key',
        'x-caller-address': 'GTEST123',
      };
      const loggerSpy = jest.spyOn(guard['logger'], 'log');

      await guard.canActivate(mockExecutionContext);

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('GTEST123'),
      );
    });

    it('should log unknown when caller address is missing', async () => {
      mockRequest.headers = { 'x-api-key': 'test-api-key' };
      const loggerSpy = jest.spyOn(guard['logger'], 'log');

      await guard.canActivate(mockExecutionContext);

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('unknown'),
      );
    });

    it('should include request method in log', async () => {
      mockRequest.headers = { 'x-api-key': 'test-api-key' };
      mockRequest.method = 'POST';
      const loggerSpy = jest.spyOn(guard['logger'], 'log');

      await guard.canActivate(mockExecutionContext);

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('POST'),
      );
    });

    it('should include request URL in log', async () => {
      mockRequest.headers = { 'x-api-key': 'test-api-key' };
      mockRequest.url = '/api/v1/oracle/pending-matches';
      const loggerSpy = jest.spyOn(guard['logger'], 'log');

      await guard.canActivate(mockExecutionContext);

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/oracle/pending-matches'),
      );
    });
  });

  describe('edge cases', () => {
    it('should handle undefined caller address gracefully', async () => {
      mockRequest.headers = { 'x-api-key': 'test-api-key' };
      mockRequest.headers['x-caller-address'] = undefined;

      const result = await guard.canActivate(mockExecutionContext);

      expect(result).toBe(true);
    });

    it('should handle empty headers', async () => {
      mockRequest.headers = {};

      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow();
    });

    it('should handle case-sensitive API key comparison', async () => {
      mockRequest.headers = { 'x-api-key': 'TEST-API-KEY' };

      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow();
    });

    it('should handle requests with multiple headers', async () => {
      mockRequest.headers = {
        'x-api-key': 'test-api-key',
        'content-type': 'application/json',
        'x-caller-address': 'GTEST123',
        authorization: 'Bearer token',
      };

      const result = await guard.canActivate(mockExecutionContext);

      expect(result).toBe(true);
    });
  });

  describe('guard implementation', () => {
    it('should implement CanActivate interface', () => {
      expect(guard).toHaveProperty('canActivate');
      expect(typeof guard.canActivate).toBe('function');
    });

    it('should be Injectable', () => {
      expect(guard).toBeDefined();
    });

    it('should accept ExecutionContext parameter', () => {
      expect(guard.canActivate.length).toBeGreaterThan(0);
    });

    it('should return Promise<boolean>', async () => {
      mockRequest.headers = { 'x-api-key': 'test-api-key' };

      const result = await guard.canActivate(mockExecutionContext);

      expect(typeof result).toBe('boolean');
    });
  });
});
