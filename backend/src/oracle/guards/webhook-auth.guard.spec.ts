import { Test, TestingModule } from '@nestjs/testing';
import { WebhookAuthGuard } from './webhook-auth.guard';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { ExecutionContext } from '@nestjs/common';
import { createHmac } from 'crypto';

function generateSignature(
  body: string,
  timestamp: string,
  secret: string,
): string {
  const message = `${timestamp}.${body}`;
  const hmac = createHmac('sha256', secret);
  hmac.update(message);
  return hmac.digest('hex');
}

describe('WebhookAuthGuard', () => {
  let guard: WebhookAuthGuard;
  let configService: ConfigService;

  const mockExecutionContext = (headers: Record<string, string>) => {
    const context = {
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({
          headers,
          body: { test: 'data' },
        }),
      }),
    } as unknown as ExecutionContext;
    return context;
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookAuthGuard,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'WEBHOOK_SECRET') return 'test-secret-key';
              return null;
            }),
          },
        },
      ],
    }).compile();

    guard = module.get<WebhookAuthGuard>(WebhookAuthGuard);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  describe('authentication', () => {
    it('should allow valid signature', () => {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const body = JSON.stringify({ test: 'data' });
      const signature = generateSignature(body, timestamp, 'test-secret-key');

      const context = mockExecutionContext({
        'x-webhook-signature': signature,
        'x-webhook-timestamp': timestamp,
      });

      const result = guard.canActivate(context);
      expect(result).toBe(true);
    });

    it('should reject missing signature', () => {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const context = mockExecutionContext({
        'x-webhook-timestamp': timestamp,
      });

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    });

    it('should reject missing timestamp', () => {
      const context = mockExecutionContext({
        'x-webhook-signature': 'some-signature',
      });

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    });

    it('should reject invalid signature', () => {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const context = mockExecutionContext({
        'x-webhook-signature': 'invalid-signature',
        'x-webhook-timestamp': timestamp,
      });

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    });

    it('should reject old timestamp (replay attack)', () => {
      const oldTimestamp = Math.floor((Date.now() - 400000) / 1000).toString(); // 6+ minutes ago
      const body = JSON.stringify({ test: 'data' });
      const signature = generateSignature(
        body,
        oldTimestamp,
        'test-secret-key',
      );

      const context = mockExecutionContext({
        'x-webhook-signature': signature,
        'x-webhook-timestamp': oldTimestamp,
      });

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    });

    it('should reject future timestamp', () => {
      const futureTimestamp = Math.floor(
        (Date.now() + 400000) / 1000,
      ).toString(); // 6+ minutes in future
      const body = JSON.stringify({ test: 'data' });
      const signature = generateSignature(
        body,
        futureTimestamp,
        'test-secret-key',
      );

      const context = mockExecutionContext({
        'x-webhook-signature': signature,
        'x-webhook-timestamp': futureTimestamp,
      });

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    });

    it('should reject when webhook secret not configured', () => {
      const module = Test.createTestingModule({
        providers: [
          WebhookAuthGuard,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn(() => null),
            },
          },
        ],
      });

      const testBed = module;
      const guardWithoutSecret = new WebhookAuthGuard({
        get: jest.fn(() => null),
      } as any);
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const context = mockExecutionContext({
        'x-webhook-signature': 'some-signature',
        'x-webhook-timestamp': timestamp,
      });

      expect(() => guardWithoutSecret.canActivate(context)).toThrow(
        UnauthorizedException,
      );
    });
  });
});
