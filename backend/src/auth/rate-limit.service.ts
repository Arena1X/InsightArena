import { Injectable } from '@nestjs/common';
import { InjectThrottlerStorage, ThrottlerStorage } from '@nestjs/throttler';
import { RateLimitStatusDto } from './dto/rate-limit-status.dto';

/** Default throttler config mirrors the global ThrottlerModule config in AppModule */
const DEFAULT_LIMIT = 100;
const DEFAULT_TTL_MS = 60_000; // 60 seconds

@Injectable()
export class RateLimitService {
  constructor(
    @InjectThrottlerStorage()
    private readonly throttlerStorage: ThrottlerStorage,
  ) {}

  /**
   * Returns the current rate-limit status for the given identifier
   * (typically the user id or IP address).
   *
   * @param identifier - unique key used by ThrottlerStorage (user id)
   */
  async getStatus(identifier: string): Promise<RateLimitStatusDto> {
    const key = `throttle:default:${identifier}`;

    let used = 0;
    try {
      const record = await this.throttlerStorage.increment(
        key,
        DEFAULT_TTL_MS,
        DEFAULT_LIMIT,
        DEFAULT_LIMIT,
        'default',
      );
      // increment returns { totalHits, timeToExpire }
      used = record.totalHits;
    } catch {
      // If storage doesn't have a record yet, treat as 0 hits
      used = 0;
    }

    const remaining = Math.max(0, DEFAULT_LIMIT - used);
    const reset_at = new Date(Date.now() + DEFAULT_TTL_MS);

    return { limit: DEFAULT_LIMIT, remaining, reset_at };
  }
}
