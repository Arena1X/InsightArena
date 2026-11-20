import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { OracleAuthGuard } from './oracle-auth.guard';
import * as StellarSdk from '@stellar/stellar-sdk';

describe('OracleAuthGuard', () => {
  let guard: OracleAuthGuard;
  let configService: ConfigService;

  const mockConfigService = {
    get: jest.fn(),
  };

  const mockExecutionContext = (headers: Record<string, string>) =>
    ({
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({
          headers,
          method: 'GET',
          url: '/oracle/pending-matches',
        }),
      }),
    }) as unknown as ExecutionContext;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OracleAuthGuard,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    guard = module.get<OracleAuthGuard>(OracleAuthGuard);
    configService = module.get<ConfigService>(ConfigService);
    jest.clearAllMocks();

    // Default mock implementations
    mockConfigService.get.mockImplementation((key: string) => {
      const config: Record<string, string> = {
        ORACLE_API_KEY: 'test-api-key',
        NODE_ENV: 'development',
      };
      return config[key];
    });
  });

  describe('canActivate', () => {
    it('should be defined', () => {
      expect(guard).toBeDefined();
    });

    it('should throw UnauthorizedException when API key is missing in development', async () => {
      const context = mockExecutionContext({});
      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException when API key is invalid in development', async () => {
      const context = mockExecutionContext({
        'x-api-key': 'wrong-key',
      });
      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should allow request with valid API key in development', async () => {
      const context = mockExecutionContext({
        'x-api-key': 'test-api-key',
      });
      const result = await guard.canActivate(context);
      expect(result).toBe(true);
    });

    it('should throw UnauthorizedException when rate limit is exceeded', async () => {
      const context = mockExecutionContext({
        'x-api-key': 'test-api-key',
        'x-caller-address': 'GABC123',
      });

      // Simulate rate limit exceeded by making 100+ requests
      for (let i = 0; i < 100; i++) {
        await guard.canActivate(context);
      }

      // Next request should fail
      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException in production when missing signature headers', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        const config: Record<string, string> = {
          ORACLE_API_KEY: 'test-api-key',
          NODE_ENV: 'production',
          AI_AGENT_ADDRESS: 'GAAAAA',
        };
        return config[key];
      });

      const guard2 = new OracleAuthGuard(mockConfigService as any);

      const context = mockExecutionContext({
        'x-caller-address': 'GAAAAA',
      });

      await expect(guard2.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException when caller address does not match AI agent in production', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        const config: Record<string, string> = {
          ORACLE_API_KEY: 'test-api-key',
          NODE_ENV: 'production',
          AI_AGENT_ADDRESS: 'GAUTHORIZED',
        };
        return config[key];
      });

      const guard2 = new OracleAuthGuard(mockConfigService as any);

      // Create a test keypair to generate a valid signature
      const keypair = StellarSdk.Keypair.random();
      const message = 'test-message';
      const signature = keypair.sign(Buffer.from(message)).toString('base64');

      const context = mockExecutionContext({
        'x-caller-address': keypair.publicKey(),
        'x-signature': signature,
        'x-message': message,
      });

      await expect(guard2.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException when API key is not configured in development', async () => {
      mockConfigService.get.mockReturnValue(undefined);

      const guard2 = new OracleAuthGuard(mockConfigService as any);

      const context = mockExecutionContext({
        'x-api-key': 'test-key',
      });

      await expect(guard2.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('rate limiting', () => {
    it('should reset rate limit after window expires', async () => {
      jest.useFakeTimers();

      const context = mockExecutionContext({
        'x-api-key': 'test-api-key',
        'x-caller-address': 'TEST_ADDR',
      });

      // Make one request
      await guard.canActivate(context);

      // Fast forward past the rate limit window (60000ms)
      jest.advanceTimersByTime(65000);

      // Should be able to make another request
      const result = await guard.canActivate(context);
      expect(result).toBe(true);

      jest.useRealTimers();
    });
  });
});
