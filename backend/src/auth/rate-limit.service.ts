import { Injectable } from '@nestjs/common';
import { InjectThrottlerStorage, ThrottlerStorage } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import { RateLimitStatusDto } from './dto/rate-limit-status.dto';

interface TierConfig {
  limit: number;
  ttl: number;
}

@Injectable()
export class RateLimitService {
  private readonly tiers: Record<string, TierConfig>;

  constructor(
    @InjectThrottlerStorage()
    private readonly throttlerStorage: ThrottlerStorage,
    configService: ConfigService,
  ) {
    this.tiers = {
      default: {
        limit: configService.get<number>('RATE_LIMIT_DEFAULT_LIMIT') ?? 100,
        ttl: configService.get<number>('RATE_LIMIT_DEFAULT_TTL_MS') ?? 60_000,
      },
      auth: {
        limit: configService.get<number>('RATE_LIMIT_AUTH_LIMIT') ?? 10,
        ttl: configService.get<number>('RATE_LIMIT_AUTH_TTL_MS') ?? 60_000,
      },
      read: {
        limit: configService.get<number>('RATE_LIMIT_READ_LIMIT') ?? 200,
        ttl: configService.get<number>('RATE_LIMIT_READ_TTL_MS') ?? 60_000,
      },
      write: {
        limit: configService.get<number>('RATE_LIMIT_WRITE_LIMIT') ?? 30,
        ttl: configService.get<number>('RATE_LIMIT_WRITE_TTL_MS') ?? 60_000,
      },
    };
  }

  /**
   * Returns the current rate-limit status for the given identifier
   * across all tiers.
   *
   * @param identifier - unique key used by ThrottlerStorage (user id)
   */
  async getStatus(
    identifier: string,
  ): Promise<Record<string, RateLimitStatusDto>> {
    const result: Record<string, RateLimitStatusDto> = {};

    for (const [tierName, tierConfig] of Object.entries(this.tiers)) {
      const key = `throttle:${tierName}:user:${identifier}`;

      let used = 0;
      try {
        const record = await this.throttlerStorage.increment(
          key,
          tierConfig.ttl,
          tierConfig.limit,
          tierConfig.limit,
          tierName,
        );
        used = record.totalHits;
      } catch {
        used = 0;
      }

      const remaining = Math.max(0, tierConfig.limit - used);
      const reset_at = new Date(Date.now() + tierConfig.ttl);

      result[tierName] = { limit: tierConfig.limit, remaining, reset_at };
    }

    return result;
  }

  /**
   * Returns the rate-limit status for a specific tier.
   */
  async getTierStatus(
    identifier: string,
    tier: string,
  ): Promise<RateLimitStatusDto> {
    const tierConfig = this.tiers[tier] ?? this.tiers.default;
    const key = `throttle:${tier}:user:${identifier}`;

    let used = 0;
    try {
      const record = await this.throttlerStorage.increment(
        key,
        tierConfig.ttl,
        tierConfig.limit,
        tierConfig.limit,
        tier,
      );
      used = record.totalHits;
    } catch {
      used = 0;
    }

    const remaining = Math.max(0, tierConfig.limit - used);
    const reset_at = new Date(Date.now() + tierConfig.ttl);

    return { limit: tierConfig.limit, remaining, reset_at };
  }
}
