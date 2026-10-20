import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { LessThan, Repository } from 'typeorm';
import { IdempotencyKey } from './idempotency-key.entity';

const POSTGRES_UNIQUE_VIOLATION = '23505';
const DEFAULT_TTL_HOURS = 24;

export type AcquireResult =
  | { acquired: true; record: IdempotencyKey }
  | { acquired: false; record: IdempotencyKey };

@Injectable()
export class IdempotencyService {
  private readonly logger = new Logger(IdempotencyService.name);

  /** How long a stored key stays valid, configurable via IDEMPOTENCY_KEY_TTL_HOURS. */
  private readonly ttlMs: number;

  constructor(
    @InjectRepository(IdempotencyKey)
    private readonly repository: Repository<IdempotencyKey>,
    private readonly configService: ConfigService,
  ) {
    const ttlHours = this.readNumberConfig(
      'IDEMPOTENCY_KEY_TTL_HOURS',
      DEFAULT_TTL_HOURS,
    );
    this.ttlMs = ttlHours * 60 * 60 * 1000;
  }

  private readNumberConfig(key: string, fallback: number): number {
    const raw = this.configService.get<string | number>(key);
    if (raw === undefined || raw === null || raw === '') {
      return fallback;
    }
    const parsed = typeof raw === 'number' ? raw : Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  /** Exposed for tests and callers that need to reason about the configured window. */
  get ttlMilliseconds(): number {
    return this.ttlMs;
  }

  private isExpired(record: IdempotencyKey): boolean {
    return Date.now() - record.created_at.getTime() > this.ttlMs;
  }

  /**
   * Atomically claims a key for a user. Relies on the unique (key, userId)
   * index to detect a concurrent or prior request with the same key.
   *
   * A record older than the configured TTL is treated as if it never
   * existed: it is purged and the request is retried as a fresh
   * acquisition, so retries past the expiry window are never blocked or
   * replayed with a stale response.
   */
  async acquire(
    key: string,
    userId: string,
    requestHash: string,
  ): Promise<AcquireResult> {
    try {
      const inserted = await this.repository.save(
        this.repository.create({
          key,
          userId,
          request_hash: requestHash,
          in_progress: true,
        }),
      );
      return { acquired: true, record: inserted };
    } catch (err) {
      if ((err as { code?: string }).code !== POSTGRES_UNIQUE_VIOLATION) {
        throw err;
      }
      const existing = await this.repository.findOneBy({ key, userId });
      if (!existing) {
        throw err;
      }
      if (this.isExpired(existing)) {
        await this.repository.delete(existing.id);
        return this.acquire(key, userId, requestHash);
      }
      return { acquired: false, record: existing };
    }
  }

  async complete(
    id: string,
    statusCode: number,
    responseBody: unknown,
  ): Promise<void> {
    await this.repository.update(id, {
      status_code: statusCode,
      response_body: responseBody as object,
      in_progress: false,
    });
  }

  /** Frees the key so the client can safely retry after a failed handler. */
  async release(id: string): Promise<void> {
    await this.repository.delete(id);
  }

  @Cron(CronExpression.EVERY_HOUR)
  async cleanupExpiredKeys(): Promise<void> {
    const cutoff = new Date(Date.now() - this.ttlMs);
    const { affected } = await this.repository.delete({
      created_at: LessThan(cutoff),
    });
    if (affected) {
      this.logger.log(`Cleaned up ${affected} expired idempotency key(s)`);
    }
  }
}
