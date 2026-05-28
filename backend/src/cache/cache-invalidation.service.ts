import { Injectable, Inject, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';

@Injectable()
export class CacheInvalidationService {
  private readonly logger = new Logger(CacheInvalidationService.name);

  constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) {}

  async invalidateOnEventCreated(eventId: string): Promise<void> {
    const keys = [
      `creator-events:${eventId}`,
      `creator-events:list`,
      `analytics:platform-stats`,
      `trending:events`,
    ];
    await this.invalidateKeys(keys);
  }

  async invalidateOnMatchAdded(eventId: string, matchId: string): Promise<void> {
    const keys = [
      `creator-events:${eventId}`,
      `creator-events:${eventId}:matches`,
      `creator-events:${eventId}:stats`,
      `match:${matchId}`,
    ];
    await this.invalidateKeys(keys);
  }

  async invalidateOnUserJoinedEvent(
    eventId: string,
    userId: string,
  ): Promise<void> {
    const keys = [
      `creator-events:${eventId}`,
      `creator-events:${eventId}:participants`,
      `creator-events:${eventId}:stats`,
      `user:${userId}:analytics`,
      `leaderboard:global`,
    ];
    await this.invalidateKeys(keys);
  }

  async invalidateOnPredictionSubmitted(
    matchId: string,
    eventId: string,
    userId: string,
  ): Promise<void> {
    const keys = [
      `match:${matchId}`,
      `match:${matchId}:predictions`,
      `creator-events:${eventId}`,
      `creator-events:${eventId}:stats`,
      `user:${userId}:predictions`,
      `user:${userId}:analytics`,
      `leaderboard:global`,
      `analytics:market:${matchId}`,
    ];
    await this.invalidateKeys(keys);
  }

  async invalidateOnMatchResultSubmitted(
    matchId: string,
    eventId: string,
  ): Promise<void> {
    const keys = [
      `match:${matchId}`,
      `match:${matchId}:predictions`,
      `creator-events:${eventId}`,
      `creator-events:${eventId}:stats`,
      `leaderboard:global`,
      `analytics:market:${matchId}`,
      `trending:events`,
    ];
    await this.invalidateKeys(keys);
  }

  async invalidateOnWinnersVerified(eventId: string): Promise<void> {
    const keys = [
      `creator-events:${eventId}`,
      `creator-events:${eventId}:winners`,
      `creator-events:${eventId}:stats`,
      `leaderboard:global`,
      `analytics:platform-stats`,
    ];
    await this.invalidateKeys(keys);
  }

  async invalidateOnEventCancelled(eventId: string): Promise<void> {
    const keys = [
      `creator-events:${eventId}`,
      `creator-events:${eventId}:*`,
      `creator-events:list`,
      `analytics:platform-stats`,
      `trending:events`,
    ];
    await this.invalidateKeys(keys);
  }

  private async invalidateKeys(keys: string[]): Promise<void> {
    try {
      const validKeys = keys.filter((k) => !k.includes('*'));
      if (validKeys.length === 0) {
        return;
      }

      await Promise.all(validKeys.map((key) => this.cacheManager.del(key)));
      this.logger.debug(`Invalidated ${validKeys.length} cache keys`);
    } catch (error) {
      this.logger.error(
        `Cache invalidation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  async invalidateCategoryCache(): Promise<void> {
    const keys = ['analytics:categories', 'search:results:*'];
    await this.invalidateKeys(keys.filter((k) => !k.includes('*')));
  }
}
