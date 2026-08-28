import {
  ExecutionContext,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { WebhookSignatureGuard } from './webhook-signature.guard';
import { WebhookSignatureService } from '../services/webhook-signature.service';

describe('WebhookSignatureGuard', () => {
  let guard: WebhookSignatureGuard;
  let signatureService: jest.Mocked<WebhookSignatureService>;

  const buildContext = (request: any): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    }) as unknown as ExecutionContext;

  const buildRequest = (overrides: Record<string, any> = {}) => ({
    params: { source: 'provider-x' },
    headers: { 'x-webhook-signature': 'abc123' },
    rawBody: Buffer.from(JSON.stringify({ event_id: 'evt_1' })),
    body: { event_id: 'evt_1' },
    ...overrides,
  });

  beforeEach(() => {
    signatureService = {
      getSecret: jest.fn().mockReturnValue('test-secret'),
      verifySignature: jest.fn().mockReturnValue(true),
      isReplay: jest.fn().mockResolvedValue(false),
      recordProcessed: jest.fn().mockResolvedValue(undefined),
      getReplayWindowMs: jest.fn().mockReturnValue(300000),
    } as unknown as jest.Mocked<WebhookSignatureService>;

    guard = new WebhookSignatureGuard(signatureService);
  });

  it('allows a request with a valid signature and a fresh event_id', async () => {
    const request = buildRequest();
    const context = buildContext(request);

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(signatureService.recordProcessed).toHaveBeenCalledWith(
      'provider-x',
      'evt_1',
    );
  });

  it('rejects with 401 when the secret is not configured (fail closed)', async () => {
    signatureService.getSecret.mockReturnValue(undefined);
    const context = buildContext(buildRequest());

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(signatureService.verifySignature).not.toHaveBeenCalled();
  });

  it('rejects with 401 when the signature header is missing', async () => {
    signatureService.verifySignature.mockReturnValue(false);
    const request = buildRequest({ headers: {} });
    const context = buildContext(request);

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects with 401 when the signature is invalid', async () => {
    signatureService.verifySignature.mockReturnValue(false);
    const context = buildContext(buildRequest());

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects with 400 when event_id is missing from the body', async () => {
    const request = buildRequest({ body: {} });
    const context = buildContext(request);

    await expect(guard.canActivate(context)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects with 401 when the event_id has already been processed within the window', async () => {
    signatureService.isReplay.mockResolvedValue(true);
    const context = buildContext(buildRequest());

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(signatureService.recordProcessed).not.toHaveBeenCalled();
  });

  it('falls back to JSON.stringify(request.body) when rawBody is unavailable', async () => {
    const request = buildRequest({ rawBody: undefined });
    const context = buildContext(request);

    await guard.canActivate(context);

    expect(signatureService.verifySignature).toHaveBeenCalledWith(
      JSON.stringify(request.body),
      'abc123',
      'test-secret',
    );
  });

  describe('timestamp tolerance', () => {
    beforeEach(() => {
      signatureService.getReplayWindowMs.mockReturnValue(300000);
    });

    it('allows a request with a fresh x-webhook-timestamp header', async () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const request = buildRequest({
        headers: {
          'x-webhook-signature': 'abc123',
          'x-webhook-timestamp': nowSec.toString(),
        },
      });
      const context = buildContext(request);

      const result = await guard.canActivate(context);
      expect(result).toBe(true);
    });

    it('rejects a request with a stale timestamp (>300s old)', async () => {
      const staleSec = Math.floor(Date.now() / 1000) - 350;
      const request = buildRequest({
        headers: {
          'x-webhook-signature': 'abc123',
          'x-webhook-timestamp': staleSec.toString(),
        },
      });
      const context = buildContext(request);

      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects a request with a future timestamp (>300s in future)', async () => {
      const futureSec = Math.floor(Date.now() / 1000) + 350;
      const request = buildRequest({
        headers: {
          'x-webhook-signature': 'abc123',
          'x-webhook-timestamp': futureSec.toString(),
        },
      });
      const context = buildContext(request);

      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects a request with an invalid non-numeric timestamp', async () => {
      const request = buildRequest({
        headers: {
          'x-webhook-signature': 'abc123',
          'x-webhook-timestamp': 'not-a-number',
        },
      });
      const context = buildContext(request);

      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
