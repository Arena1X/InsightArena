import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { WebhookProcessedEvent } from '../entities/webhook-processed-event.entity';

const DEFAULT_REPLAY_WINDOW_SECONDS = 300;

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
