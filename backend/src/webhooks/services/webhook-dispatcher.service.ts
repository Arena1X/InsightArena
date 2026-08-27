import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HttpService } from '@nestjs/axios';
import * as crypto from 'crypto';
import { WebhookEndpoint } from '../entities/webhook-endpoint.entity';
import {
  WebhookDeliveryLog,
  DeliveryStatus,
} from '../entities/webhook-delivery-log.entity';

@Injectable()
export class WebhookDispatcherService {
  private readonly logger = new Logger(WebhookDispatcherService.name);
  private readonly maxAttempts = parseInt(
    process.env.WEBHOOK_MAX_ATTEMPTS || '5',
    10,
  );
  private readonly timeoutMs = parseInt(
    process.env.WEBHOOK_TIMEOUT_MS || '5000',
    10,
  );

  constructor(
    @InjectRepository(WebhookEndpoint)
    private readonly endpointRepository: Repository<WebhookEndpoint>,
    @InjectRepository(WebhookDeliveryLog)
    private readonly deliveryLogRepository: Repository<WebhookDeliveryLog>,
    private readonly httpService: HttpService,
  ) {}

  async emit(
    eventType: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const endpoints = await this.endpointRepository.find({
      where: {
        is_active: true,
      },
    });

    const targetEndpoints = endpoints.filter((ep) =>
      ep.event_types.includes(eventType),
    );

    if (targetEndpoints.length === 0) {
      this.logger.debug(`No active endpoints for event type: ${eventType}`);
      return;
    }

    for (const endpoint of targetEndpoints) {
      await this.createDeliveryLog(endpoint, eventType, payload);
    }

    this.logger.log(
      `Queued webhook delivery for event "${eventType}" to ${targetEndpoints.length} endpoint(s)`,
    );
  }

  private async createDeliveryLog(
    endpoint: WebhookEndpoint,
    eventType: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const log = this.deliveryLogRepository.create({
      endpoint,
      event_type: eventType,
      payload,
      status: DeliveryStatus.PENDING,
      attempt_count: 0,
      next_retry_at: new Date(),
    });

    await this.deliveryLogRepository.save(log);
  }

  async processPendingDeliveries(): Promise<void> {
    const now = new Date();

    const pendingLogs = await this.deliveryLogRepository.find({
      where: {
        status: DeliveryStatus.PENDING,
      },
      relations: ['endpoint'],
      take: parseInt(process.env.WEBHOOK_BATCH_SIZE || '50', 10),
    });

    const readyLogs = pendingLogs.filter((log) => {
      if (!log.next_retry_at) return true;
      return log.next_retry_at <= now;
    });

    for (const log of readyLogs) {
      await this.attemptDelivery(log);
    }

    if (readyLogs.length > 0) {
      this.logger.debug(`Processed ${readyLogs.length} pending deliveries`);
    }
  }

  private async attemptDelivery(log: WebhookDeliveryLog): Promise<void> {
    const { endpoint, payload, event_type } = log;
    const attempt = log.attempt_count + 1;

    try {
      const signature = this.generateSignature(payload, endpoint.secret_key);

      const response = await this.httpService.axiosRef.post(
        endpoint.url,
        payload,
        {
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-Signature': signature,
            'X-Webhook-Event': event_type,
            'X-Delivery-Attempt': String(attempt),
          },
          timeout: this.timeoutMs,
        },
      );

      if (response.status >= 200 && response.status < 300) {
        log.status = DeliveryStatus.SUCCESS;
        log.http_status_code = response.status;
        log.delivered_at = new Date();
        endpoint.last_delivery_at = new Date();
        endpoint.failure_count = 0;
      } else {
        this.scheduleRetry(log, attempt);
        endpoint.last_failure_at = new Date();
        endpoint.failure_count += 1;
      }
    } catch (error) {
      this.scheduleRetry(log, attempt);
      endpoint.last_failure_at = new Date();
      endpoint.failure_count += 1;

      const errorMsg = error instanceof Error ? error.message : String(error);
      log.error_message = errorMsg;

      if (error && typeof error === 'object' && 'response' in error) {
        const response = error.response;
        log.http_status_code = response?.status || null;
      }
    }

    log.attempt_count = attempt;
    await this.deliveryLogRepository.save(log);
    await this.endpointRepository.save(endpoint);
  }

  private scheduleRetry(log: WebhookDeliveryLog, attempt: number): void {
    if (attempt >= this.maxAttempts) {
      log.status = DeliveryStatus.DEAD_LETTER;
      log.next_retry_at = null;
      this.logger.warn(
        `Webhook delivery ${log.id} moved to dead-letter after ${attempt} attempts`,
      );
    } else {
      const backoffMs = Math.min(Math.pow(2, attempt - 1) * 1000, 3600000); // cap at 1 hour
      log.next_retry_at = new Date(Date.now() + backoffMs);
    }
  }

  private generateSignature(
    payload: Record<string, unknown>,
    secretKey: string,
  ): string {
    const payloadStr = JSON.stringify(payload);
    return crypto
      .createHmac('sha256', secretKey)
      .update(payloadStr)
      .digest('hex');
  }
}
