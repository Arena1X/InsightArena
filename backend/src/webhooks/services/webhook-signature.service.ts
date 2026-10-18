import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { WebhookProcessedEvent } from '../entities/webhook-processed-event.entity';

const DEFAULT_REPLAY_WINDOW_SECONDS = 300;
const DEFAULT_TIMESTAMP_FRESHNESS_SECONDS = 300;
const DEFAULT_CLOCK_SKEW_TOLERANCE_SECONDS = 60;

@Injectable()
export class WebhookSignatureService {
  private readonly logger = new Logger(WebhookSignatureService.name);

  constructor(
    @InjectRepository(WebhookProcessedEvent)
    private readonly processedEventRepository: Repository<WebhookProcessedEvent>,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Verifies an HMAC-SHA256 signature of the raw request body against the
   * provided signature header, using a constant-time comparison.
   */
  verifySignature(
    rawBody: string,
    signatureHeader: string | undefined,
    secret: string,
  ): boolean {
    if (!signatureHeader) {
      return false;
    }

    try {
      const expected = crypto
        .createHmac('sha256', secret)
        .update(rawBody)
        .digest('hex');

      const expectedBuffer = Buffer.from(expected, 'hex');
      const receivedBuffer = Buffer.from(signatureHeader, 'hex');

      if (expectedBuffer.byteLength !== receivedBuffer.byteLength) {
        return false;
      }

      return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
    } catch (error) {
      this.logger.warn(
        `Failed to verify webhook signature: ${(error as Error).message}`,
      );
      return false;
    }
  }

  getSecret(): string | undefined {
    return this.configService.get<string>('WEBHOOK_HMAC_SECRET');
  }

  getReplayWindowMs(): number {
    const seconds = this.configService.get<number>(
      'WEBHOOK_REPLAY_WINDOW_SECONDS',
    );
    return (seconds ?? DEFAULT_REPLAY_WINDOW_SECONDS) * 1000;
  }

  getTimestampFreshnessMs(): number {
    const seconds = this.configService.get<number>(
      'WEBHOOK_TIMESTAMP_FRESHNESS_SECONDS',
    );
    return (seconds ?? DEFAULT_TIMESTAMP_FRESHNESS_SECONDS) * 1000;
  }

  getClockSkewToleranceMs(): number {
    const seconds = this.configService.get<number>(
      'WEBHOOK_CLOCK_SKEW_TOLERANCE_SECONDS',
    );
    return (seconds ?? DEFAULT_CLOCK_SKEW_TOLERANCE_SECONDS) * 1000;
  }

  /**
   * Validates that the provided timestamp is within the freshness window,
   * accounting for clock skew tolerance.
   *
   * This method implements a two-tier validation:
   * 1. First checks if timestamp is within the freshness window
   * 2. If outside freshness window, checks if it's within clock skew tolerance
   *
   * Clock skew tolerance handles legitimate time differences between systems
   * while the freshness window prevents replay attacks.
   *
   * Returns true if the timestamp is fresh (within the window), false otherwise.
   */
  isTimestampFresh(timestampStr: string | undefined): boolean {
    if (!timestampStr) {
      return false;
    }

    try {
      const timestamp = parseInt(timestampStr, 10);
      if (isNaN(timestamp)) {
        return false;
      }

      const nowSeconds = Math.floor(Date.now() / 1000);
      const age = Math.abs(nowSeconds - timestamp);
      const freshnessWindowSeconds = this.getTimestampFreshnessMs() / 1000;
      const clockSkewToleranceSeconds = this.getClockSkewToleranceMs() / 1000;

      // Primary check: within freshness window
      if (age <= freshnessWindowSeconds) {
        return true;
      }

      // Secondary check: within clock skew tolerance
      // This handles cases where sender's clock is ahead or behind
      if (age <= freshnessWindowSeconds + clockSkewToleranceSeconds) {
        this.logger.debug(
          `Webhook timestamp outside freshness window but within clock skew tolerance (age: ${age}s, tolerance: ${clockSkewToleranceSeconds}s)`,
        );
        return true;
      }

      this.logger.warn(
        `Webhook timestamp rejected: age ${age}s exceeds freshness window (${freshnessWindowSeconds}s) + clock skew tolerance (${clockSkewToleranceSeconds}s)`,
      );
      return false;
    } catch (error) {
      this.logger.warn(
        `Failed to validate webhook timestamp: ${(error as Error).message}`,
      );
      return false;
    }
  }

  async isReplay(source: string, eventId: string): Promise<boolean> {
    const existing = await this.processedEventRepository.findOne({
      where: { source, event_id: eventId },
    });

    if (!existing) {
      return false;
    }

    const age = Date.now() - existing.received_at.getTime();
    return age < this.getReplayWindowMs();
  }

  async recordProcessed(source: string, eventId: string): Promise<void> {
    try {
      const record = this.processedEventRepository.create({
        source,
        event_id: eventId,
      });
      await this.processedEventRepository.save(record);
    } catch (error) {
      // Defensive: if a concurrent request already recorded this event,
      // the DB-level unique constraint will reject the second insert.
      // Treat that as "already recorded" rather than a hard failure.
      this.logger.warn(
        `Failed to record processed webhook event (possible concurrent duplicate): ${
          (error as Error).message
        }`,
      );
    }
  }
}
