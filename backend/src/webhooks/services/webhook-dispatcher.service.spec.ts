import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HttpService } from '@nestjs/axios';
import * as crypto from 'crypto';
import { WebhookDispatcherService } from './webhook-dispatcher.service';
import { WebhookEndpoint } from '../entities/webhook-endpoint.entity';
import {
  DeliveryStatus,
  WebhookDeliveryLog,
} from '../entities/webhook-delivery-log.entity';

describe('WebhookDispatcherService', () => {
  let service: WebhookDispatcherService;
  let endpointRepository: jest.Mocked<
    Pick<Repository<WebhookEndpoint>, 'find' | 'save'>
  >;
  let deliveryLogRepository: jest.Mocked<
    Pick<Repository<WebhookDeliveryLog>, 'find' | 'save' | 'create'>
  >;
  let httpService: { axiosRef: { post: jest.Mock } };

  const makeEndpoint = (
    overrides: Partial<WebhookEndpoint> = {},
  ): WebhookEndpoint =>
    ({
      id: 'endpoint-1',
      url: 'https://example.com/hook',
      event_types: ['event.created'],
      secret_key: 'shhh-secret',
      is_active: true,
      failure_count: 0,
      last_delivery_at: null,
      last_failure_at: null,
      ...overrides,
    }) as WebhookEndpoint;

  const makeLog = (
    overrides: Partial<WebhookDeliveryLog> = {},
  ): WebhookDeliveryLog =>
    ({
      id: 'log-1',
      endpoint: makeEndpoint(),
      event_type: 'event.created',
      payload: { foo: 'bar' },
      status: DeliveryStatus.PENDING,
      attempt_count: 0,
      http_status_code: null,
      error_message: null,
      next_retry_at: new Date(),
      created_at: new Date(),
      delivered_at: null,
      ...overrides,
    }) as WebhookDeliveryLog;

  beforeEach(async () => {
    endpointRepository = { find: jest.fn(), save: jest.fn() };
    deliveryLogRepository = {
      find: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
    };
    httpService = { axiosRef: { post: jest.fn() } };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookDispatcherService,
        {
          provide: getRepositoryToken(WebhookEndpoint),
          useValue: endpointRepository,
        },
        {
          provide: getRepositoryToken(WebhookDeliveryLog),
          useValue: deliveryLogRepository,
        },
        { provide: HttpService, useValue: httpService },
      ],
    }).compile();

    service = module.get<WebhookDispatcherService>(WebhookDispatcherService);

    deliveryLogRepository.save.mockImplementation(
      async (log) => log as WebhookDeliveryLog,
    );
    endpointRepository.save.mockImplementation(
      async (ep) => ep as WebhookEndpoint,
    );
  });

  describe('retry schedule (exponential backoff)', () => {
    it('schedules the next retry with exponential backoff and keeps status pending', async () => {
      const log = makeLog({ attempt_count: 0 });
      httpService.axiosRef.post.mockRejectedValue(new Error('ECONNREFUSED'));

      await (service as any).attemptDelivery(log);

      expect(log.attempt_count).toBe(1);
      expect(log.status).toBe(DeliveryStatus.PENDING);
      expect(log.next_retry_at).not.toBeNull();
      const delayMs = log.next_retry_at!.getTime() - Date.now();
      // attempt 1 -> 2^0 * 1000ms = 1000ms
      expect(delayMs).toBeGreaterThan(500);
      expect(delayMs).toBeLessThanOrEqual(1500);
    });

    it('doubles the backoff on each successive attempt, capped at 1 hour', () => {
      const attemptDelays = [1, 2, 3, 4, 5, 6, 20].map((attempt) => {
        const log = makeLog();
        (service as any).scheduleRetry(log, attempt);
        return log.next_retry_at
          ? log.next_retry_at.getTime() - Date.now()
          : null;
      });

      // attempt 1..4 are under the max attempt cap (default 5), so they schedule.
      expect(attemptDelays[0]).toBeGreaterThan(0);
      expect(attemptDelays[0]).toBeLessThanOrEqual(1500);
      expect(attemptDelays[1]).toBeGreaterThan(1500);
      expect(attemptDelays[1]).toBeLessThanOrEqual(2500);
      expect(attemptDelays[2]).toBeGreaterThan(3500);
      expect(attemptDelays[2]).toBeLessThanOrEqual(4500);
      expect(attemptDelays[3]).toBeGreaterThan(7500);
      expect(attemptDelays[3]).toBeLessThanOrEqual(8500);

      // attempt 5 (== maxAttempts) and beyond are exhausted -> no next_retry_at.
      expect(attemptDelays[4]).toBeNull();
      expect(attemptDelays[5]).toBeNull();
      expect(attemptDelays[6]).toBeNull();
    });
  });

  describe('dead-letter transition', () => {
    it('moves a delivery to DEAD_LETTER once max attempts are exhausted', async () => {
      const log = makeLog({ attempt_count: 4 }); // this attempt will be #5 (default max)
      httpService.axiosRef.post.mockRejectedValue(new Error('still down'));

      await (service as any).attemptDelivery(log);

      expect(log.attempt_count).toBe(5);
      expect(log.status).toBe(DeliveryStatus.DEAD_LETTER);
      expect(log.next_retry_at).toBeNull();
      expect(log.error_message).toContain('still down');
    });

    it('does not dead-letter a delivery before attempts are exhausted', async () => {
      const log = makeLog({ attempt_count: 1 });
      httpService.axiosRef.post.mockRejectedValue(new Error('timeout'));

      await (service as any).attemptDelivery(log);

      expect(log.attempt_count).toBe(2);
      expect(log.status).not.toBe(DeliveryStatus.DEAD_LETTER);
      expect(log.next_retry_at).not.toBeNull();
    });
  });

  describe('signature preservation across retries', () => {
    it('recomputes an identical HMAC signature on every retry attempt for the same payload/secret', async () => {
      const log = makeLog({ attempt_count: 0 });
      httpService.axiosRef.post.mockRejectedValue(new Error('boom'));

      await (service as any).attemptDelivery(log); // attempt 1
      const firstCallHeaders = httpService.axiosRef.post.mock.calls[0][2]
        .headers as Record<string, string>;

      await (service as any).attemptDelivery(log); // attempt 2 (retry)
      const secondCallHeaders = httpService.axiosRef.post.mock.calls[1][2]
        .headers as Record<string, string>;

      const expectedSignature = crypto
        .createHmac('sha256', log.endpoint.secret_key)
        .update(JSON.stringify(log.payload))
        .digest('hex');

      expect(firstCallHeaders['X-Webhook-Signature']).toBe(expectedSignature);
      expect(secondCallHeaders['X-Webhook-Signature']).toBe(expectedSignature);
      expect(firstCallHeaders['X-Webhook-Signature']).toBe(
        secondCallHeaders['X-Webhook-Signature'],
      );
      expect(secondCallHeaders['X-Delivery-Attempt']).toBe('2');
    });
  });

  describe('processPendingDeliveries', () => {
    it('only attempts deliveries whose next_retry_at has elapsed', async () => {
      const dueLog = makeLog({
        id: 'due',
        next_retry_at: new Date(Date.now() - 1000),
      });
      const notDueLog = makeLog({
        id: 'not-due',
        next_retry_at: new Date(Date.now() + 60_000),
      });
      deliveryLogRepository.find.mockResolvedValue([dueLog, notDueLog]);
      httpService.axiosRef.post.mockResolvedValue({ status: 200 });

      await service.processPendingDeliveries();

      expect(httpService.axiosRef.post).toHaveBeenCalledTimes(1);
      expect(httpService.axiosRef.post).toHaveBeenCalledWith(
        dueLog.endpoint.url,
        expect.anything(),
        expect.anything(),
      );
    });
  });
});
