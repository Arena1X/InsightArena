import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TieredThrottlerGuard } from './tiered-throttler.guard';
import { THROTTLE_TIER_KEY } from '../decorators/throttle-tier.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ThrottlerStorage } from '@nestjs/throttler';

describe('TieredThrottlerGuard', () => {
  let guard: TieredThrottlerGuard;
  let reflector: Reflector;

  const mockStorage = {
    increment: jest.fn(),
    decrement: jest.fn(),
    reset: jest.fn(),
  } as unknown as ThrottlerStorage;

  const mockJwtService = {
    decode: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    reflector = { getAllAndOverride: jest.fn() } as unknown as Reflector;

    guard = new TieredThrottlerGuard(
      { throttlers: [] } as any,
      mockStorage,
      reflector,
      mockJwtService as any,
      mockConfigService as any,
    );

    // Set up throttlers with named tiers
    (guard as any).throttlers = [
      { name: 'default', limit: 100, ttl: 60000 },
      { name: 'auth', limit: 10, ttl: 60000 },
      { name: 'read', limit: 200, ttl: 60000 },
      { name: 'write', limit: 30, ttl: 60000 },
    ];
    (guard as any).storageService = mockStorage;
    (guard as any).reflector = reflector;
  });

  describe('canActivate', () => {
    it('should skip throttling when no tier throttlers match', async () => {
      (reflector.getAllAndOverride as jest.Mock).mockImplementation(
        (key: string) => {
          if (key === THROTTLE_TIER_KEY) return 'nonexistent';
          if (key === IS_PUBLIC_KEY) return false;
          return undefined;
        },
      );

      const context = createContext({});
      const result = await guard.canActivate(context);
      expect(result).toBe(true);
    });

    it('should skip throttling for non-existent tier', async () => {
      (reflector.getAllAndOverride as jest.Mock).mockImplementation(
        (key: string) => {
          if (key === THROTTLE_TIER_KEY) return 'nonexistent';
          if (key === IS_PUBLIC_KEY) return false;
          return undefined;
        },
      );

      const context = createContext({});
      const result = await guard.canActivate(context);
      expect(result).toBe(true);
    });
  });

  describe('getTracker', () => {
    it('should use user ID from JWT when token is present', async () => {
      mockJwtService.decode.mockReturnValue({ sub: 'user-456' });
      const req = {
        headers: { authorization: 'Bearer some-token' },
        ip: '127.0.0.1',
      };

      const tracker = await (guard as any).getTracker(req);
      expect(tracker).toBe('user:user-456');
    });

    it('should fall back to IP when no token is present', async () => {
      const req = {
        headers: {},
        ip: '192.168.1.1',
      };

      const tracker = await (guard as any).getTracker(req);
      expect(tracker).toBe('192.168.1.1');
    });

    it('should fall back to IP when token decode fails', async () => {
      mockJwtService.decode.mockImplementation(() => {
        throw new Error('Invalid token');
      });
      const req = {
        headers: { authorization: 'Bearer bad-token' },
        ip: '10.0.0.1',
      };

      const tracker = await (guard as any).getTracker(req);
      expect(tracker).toBe('10.0.0.1');
    });

    it('should use socket remoteAddress when IP is not available', async () => {
      const req = {
        headers: {},
        socket: { remoteAddress: '172.16.0.1' },
      };

      const tracker = await (guard as any).getTracker(req);
      expect(tracker).toBe('172.16.0.1');
    });

    it('should return unknown when no IP or token is available', async () => {
      const req = { headers: {} };

      const tracker = await (guard as any).getTracker(req);
      expect(tracker).toBe('unknown');
    });
  });

  describe('generateKey', () => {
    it('should generate user-scoped key when JWT has sub claim', () => {
      mockJwtService.decode.mockReturnValue({ sub: 'user-789' });
      const req = {
        headers: { authorization: 'Bearer token' },
        ip: '127.0.0.1',
      };
      const context = {
        switchToHttp: () => ({
          getRequest: () => req,
        }),
      } as unknown as ExecutionContext;

      const key = (guard as any).generateKey(context, 'suffix', 'read');
      expect(key).toContain('throttle:read:user:user-789');
      expect(key).toContain('suffix');
    });

    it('should generate IP-scoped key when no token', () => {
      const req = {
        headers: {},
        ip: '192.168.1.1',
      };
      const context = {
        switchToHttp: () => ({
          getRequest: () => req,
        }),
      } as unknown as ExecutionContext;

      const key = (guard as any).generateKey(context, 'suffix', 'auth');
      expect(key).toContain('throttle:auth:192.168.1.1');
      expect(key).toContain('suffix');
    });
  });

  describe('per-user isolation', () => {
    it('should track different users independently', async () => {
      mockJwtService.decode.mockReturnValue({ sub: 'user-A' });
      const trackerA = await (guard as any).getTracker({
        headers: { authorization: 'Bearer token-a' },
        ip: '127.0.0.1',
      });
      expect(trackerA).toBe('user:user-A');

      mockJwtService.decode.mockReturnValue({ sub: 'user-B' });
      const trackerB = await (guard as any).getTracker({
        headers: { authorization: 'Bearer token-b' },
        ip: '127.0.0.1',
      });
      expect(trackerB).toBe('user:user-B');

      expect(trackerA).not.toBe(trackerB);
    });
  });
});

function createContext(overrides: {
  authHeader?: string;
  ip?: string;
}): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        headers: overrides.authHeader
          ? { authorization: overrides.authHeader }
          : {},
        ip: overrides.ip ?? '127.0.0.1',
        socket: { remoteAddress: '127.0.0.1' },
      }),
      getResponse: () => ({
        setHeader: jest.fn(),
      }),
    }),
    getHandler: () => 'handler',
    getClass: () => 'class',
    getArgs: () => [],
    getArgByIndex: () => ({}),
    switchToRpc: () => ({
      getContext: () => ({}),
      getArgs: () => [],
    }),
    switchToWs: () => ({
      getData: () => ({}),
      getArgs: () => [],
      getClient: () => ({}),
      getPattern: () => '',
    }),
    getType: () => 'http',
    debug: jest.fn(),
  } as unknown as ExecutionContext;
}
