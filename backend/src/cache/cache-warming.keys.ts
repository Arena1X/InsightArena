export const CACHE_WARMING_KEYS = {
  activeEvents: 'cache-warming:active-events',
  trendingEvents: 'cache-warming:trending-events',
  platformStatistics: 'cache-warming:platform-statistics',
  popularEventDetail: (eventId: string) =>
    `cache-warming:popular-event:${eventId}`,
  leaderboardCursor: (seasonId: string | null, page: number) =>
    `leaderboard:cursor:${seasonId ?? 'all'}:page:${page}`,
  leaderboardCursorPattern: (seasonId: string | null) =>
    `leaderboard:cursor:${seasonId ?? 'all'}:page:*`,
  leaderboardTopN: (n: number, seasonId: string | null) =>
    `leaderboard:top:${n}:${seasonId ?? 'all'}`,
  marketOddsSnapshot: (marketId: string) =>
    `cache-warming:market-odds-snapshot:${marketId}`,
} as const;
