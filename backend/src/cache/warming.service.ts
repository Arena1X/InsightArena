import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import type { Cache } from 'cache-manager';
import { AnalyticsService } from '../analytics/analytics.service';
import { MarketStatus } from '../markets/dto/list-markets.dto';
import { MarketsService } from '../markets/markets.service';
import { LeaderboardService } from '../leaderboard/leaderboard.service';
import {
  CacheWarmingStrategy,
  getCacheWarmingStrategy,
} from './cache-warming.config';
import { CACHE_WARMING_KEYS } from './cache-warming.keys';

interface WarmMetrics {
  warmed: string[];
  failed: Array<{ key: string; reason: string }>;
  duration_ms: number;
}

type CacheWarmResult = Omit<WarmMetrics, 'duration_ms'>;

@Injectable()
export class CacheWarmingService {
  private readonly logger = new Logger(CacheWarmingService.name);
  private readonly strategy: CacheWarmingStrategy;

  constructor(
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    private readonly marketsService: MarketsService,
    private readonly analyticsService: AnalyticsService,
    private readonly leaderboardService: LeaderboardService,
    configService: ConfigService,
  ) {
    this.strategy = getCacheWarmingStrategy(configService);
  }

  @Cron('0 */10 * * * *')
  async warmFrequentlyAccessedData(): Promise<CacheWarmResult> {
    if (!this.strategy.enabled) {
      this.logger.debug('Cache warming skipped because it is disabled');
      return { warmed: [], failed: [] };
    }

    const start = Date.now();
    this.logger.log('Cache warming started');
    const result: CacheWarmResult = { warmed: [], failed: [] };

    const [, trendingEvents] = await Promise.all([
      this.warmActiveEvents(result),
      this.warmTrendingEvents(result),
      this.warmPlatformStatistics(result),
      this.warmLeaderboard(result),
    ]);

    await this.warmPopularEventDetails(result, trendingEvents?.data ?? []);

    const duration_ms = Date.now() - start;
    this.logger.log(
      `Cache warming finished: warmed=${result.warmed.length}, failed=${result.failed.length}, duration=${duration_ms}ms`,
    );

    return result;
  }

  /** Warm leaderboard top-N slices for all configured seasons. */
  async warmLeaderboard(result: CacheWarmResult): Promise<void> {
    const seasonIds: Array<string | undefined> = [
      undefined,
      ...this.strategy.leaderboardSeasonIds,
    ];

    await Promise.all(
      this.strategy.leaderboardTopN.flatMap((n) =>
        seasonIds.map((seasonId) =>
          this.captureWarmOperation(
            CACHE_WARMING_KEYS.leaderboardTopN(n, seasonId ?? null),
            () => this.leaderboardService.getTopN(n, seasonId),
            result,
          ),
        ),
      ),
    );
  }

  private async warmActiveEvents(
    result: CacheWarmResult,
  ): Promise<Awaited<ReturnType<MarketsService['findAllFiltered']>> | null> {
    return this.captureWarmOperation(
      CACHE_WARMING_KEYS.activeEvents,
      async () =>
        this.marketsService.findAllFiltered({
          page: 1,
          limit: this.strategy.activeEventsLimit,
          status: MarketStatus.Open,
          is_public: true,
        }),
      result,
    );
  }

  private async warmTrendingEvents(
    result: CacheWarmResult,
  ): Promise<Awaited<ReturnType<MarketsService['getTrendingMarkets']>> | null> {
    return this.captureWarmOperation(
      CACHE_WARMING_KEYS.trendingEvents,
      async () =>
        this.marketsService.getTrendingMarkets({
          page: 1,
          limit: this.strategy.trendingEventsLimit,
        }),
      result,
    );
  }

  private async warmPlatformStatistics(
    result: CacheWarmResult,
  ): Promise<Awaited<
    ReturnType<AnalyticsService['getCategoryAnalytics']>
  > | null> {
    return this.captureWarmOperation(
      CACHE_WARMING_KEYS.platformStatistics,
      () => this.analyticsService.getCategoryAnalytics(),
      result,
    );
  }

  private async warmPopularEventDetails(
    result: CacheWarmResult,
    trendingEvents: Array<{ id: string }>,
  ): Promise<void> {
    const popularIds = trendingEvents
      .slice(0, this.strategy.popularEventDetailsLimit)
      .map((event) => event.id);

    await Promise.all(
      popularIds.map((eventId) =>
        this.captureWarmOperation(
          CACHE_WARMING_KEYS.popularEventDetail(eventId),
          () => this.marketsService.findByIdOrOnChainId(eventId),
          result,
        ),
      ),
    );
  }

  private async captureWarmOperation<T>(
    key: string,
    loader: () => Promise<T>,
    result: CacheWarmResult,
  ): Promise<T | null> {
    try {
      const value = await loader();
      await this.cacheManager.set(key, value, this.strategy.ttlSeconds * 1000);
      result.warmed.push(key);
      this.logger.debug(`Cache warmed: ${key}`);
      return value;
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unknown error';
      result.failed.push({ key, reason });
      this.logger.warn(`Cache warming failed for ${key}: ${reason}`);
      return null;
    }
  }
}
