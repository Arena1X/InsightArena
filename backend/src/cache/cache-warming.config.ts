import { ConfigService } from '@nestjs/config';

export interface CacheWarmingStrategy {
  enabled: boolean;
  ttlSeconds: number;
  activeEventsLimit: number;
  trendingEventsLimit: number;
  popularEventDetailsLimit: number;
  leaderboardTopN: number[];
  leaderboardSeasonIds: string[];
}

function numberFromConfig(
  configService: ConfigService,
  key: string,
  defaultValue: number,
): number {
  const value = Number(configService.get<string | number>(key));

  return Number.isFinite(value) && value > 0 ? value : defaultValue;
}

export function getCacheWarmingStrategy(
  configService: ConfigService,
): CacheWarmingStrategy {
  const rawTopN = configService.get<string>(
    'CACHE_WARMING_LEADERBOARD_TOP_N',
    '10,20',
  );
  const leaderboardTopN = rawTopN
    .split(',')
    .map((v) => parseInt(v.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0);

  const rawSeasons = configService.get<string>(
    'CACHE_WARMING_LEADERBOARD_SEASON_IDS',
    '',
  );
  const leaderboardSeasonIds = rawSeasons
    ? rawSeasons
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  return {
    enabled: configService.get<string>('CACHE_WARMING_ENABLED') !== 'false',
    ttlSeconds: numberFromConfig(
      configService,
      'CACHE_WARMING_TTL_SECONDS',
      600,
    ),
    activeEventsLimit: numberFromConfig(
      configService,
      'CACHE_WARMING_ACTIVE_EVENTS_LIMIT',
      20,
    ),
    trendingEventsLimit: numberFromConfig(
      configService,
      'CACHE_WARMING_TRENDING_EVENTS_LIMIT',
      20,
    ),
    popularEventDetailsLimit: numberFromConfig(
      configService,
      'CACHE_WARMING_POPULAR_EVENT_DETAILS_LIMIT',
      5,
    ),
    leaderboardTopN: leaderboardTopN.length > 0 ? leaderboardTopN : [10, 20],
    leaderboardSeasonIds,
  };
}
