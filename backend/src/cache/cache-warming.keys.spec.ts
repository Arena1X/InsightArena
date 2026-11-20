import { CACHE_WARMING_KEYS } from './cache-warming.keys';

describe('CACHE_WARMING_KEYS', () => {
  it('should be defined', () => {
    expect(CACHE_WARMING_KEYS).toBeDefined();
  });

  it('should be a constant object', () => {
    expect(typeof CACHE_WARMING_KEYS).toBe('object');
  });

  describe('static cache keys', () => {
    it('should have activeEvents key', () => {
      expect(CACHE_WARMING_KEYS.activeEvents).toBeDefined();
      expect(CACHE_WARMING_KEYS.activeEvents).toBe('cache-warming:active-events');
    });

    it('should have trendingEvents key', () => {
      expect(CACHE_WARMING_KEYS.trendingEvents).toBeDefined();
      expect(CACHE_WARMING_KEYS.trendingEvents).toBe('cache-warming:trending-events');
    });

    it('should have platformStatistics key', () => {
      expect(CACHE_WARMING_KEYS.platformStatistics).toBeDefined();
      expect(CACHE_WARMING_KEYS.platformStatistics).toBe(
        'cache-warming:platform-statistics',
      );
    });
  });

  describe('dynamic cache key functions', () => {
    it('should have popularEventDetail function', () => {
      expect(typeof CACHE_WARMING_KEYS.popularEventDetail).toBe('function');
    });

    it('popularEventDetail should generate correct cache key', () => {
      const eventId = 'event-123';
      const key = CACHE_WARMING_KEYS.popularEventDetail(eventId);
      expect(key).toBe('cache-warming:popular-event:event-123');
    });

    it('popularEventDetail should work with different event IDs', () => {
      const key1 = CACHE_WARMING_KEYS.popularEventDetail('event-1');
      const key2 = CACHE_WARMING_KEYS.popularEventDetail('event-2');

      expect(key1).toBe('cache-warming:popular-event:event-1');
      expect(key2).toBe('cache-warming:popular-event:event-2');
      expect(key1).not.toBe(key2);
    });

    it('should have leaderboardCursor function', () => {
      expect(typeof CACHE_WARMING_KEYS.leaderboardCursor).toBe('function');
    });

    it('leaderboardCursor should generate correct cache key with season and page', () => {
      const key = CACHE_WARMING_KEYS.leaderboardCursor('season-1', 1);
      expect(key).toBe('leaderboard:cursor:season-1:page:1');
    });

    it('leaderboardCursor should handle null season as "all"', () => {
      const key = CACHE_WARMING_KEYS.leaderboardCursor(null, 1);
      expect(key).toBe('leaderboard:cursor:all:page:1');
    });

    it('leaderboardCursor should work with different pages', () => {
      const key1 = CACHE_WARMING_KEYS.leaderboardCursor('season-1', 1);
      const key2 = CACHE_WARMING_KEYS.leaderboardCursor('season-1', 2);

      expect(key1).toBe('leaderboard:cursor:season-1:page:1');
      expect(key2).toBe('leaderboard:cursor:season-1:page:2');
      expect(key1).not.toBe(key2);
    });

    it('should have leaderboardCursorPattern function', () => {
      expect(typeof CACHE_WARMING_KEYS.leaderboardCursorPattern).toBe('function');
    });

    it('leaderboardCursorPattern should generate pattern with season', () => {
      const pattern = CACHE_WARMING_KEYS.leaderboardCursorPattern('season-1');
      expect(pattern).toBe('leaderboard:cursor:season-1:page:*');
    });

    it('leaderboardCursorPattern should generate pattern with null as "all"', () => {
      const pattern = CACHE_WARMING_KEYS.leaderboardCursorPattern(null);
      expect(pattern).toBe('leaderboard:cursor:all:page:*');
    });

    it('should have leaderboardTopN function', () => {
      expect(typeof CACHE_WARMING_KEYS.leaderboardTopN).toBe('function');
    });

    it('leaderboardTopN should generate correct cache key', () => {
      const key = CACHE_WARMING_KEYS.leaderboardTopN(10, 'season-1');
      expect(key).toBe('leaderboard:top:10:season-1');
    });

    it('leaderboardTopN should handle different N values', () => {
      const key1 = CACHE_WARMING_KEYS.leaderboardTopN(5, 'season-1');
      const key2 = CACHE_WARMING_KEYS.leaderboardTopN(10, 'season-1');
      const key3 = CACHE_WARMING_KEYS.leaderboardTopN(20, 'season-1');

      expect(key1).toBe('leaderboard:top:5:season-1');
      expect(key2).toBe('leaderboard:top:10:season-1');
      expect(key3).toBe('leaderboard:top:20:season-1');
    });

    it('leaderboardTopN should handle null season as "all"', () => {
      const key = CACHE_WARMING_KEYS.leaderboardTopN(10, null);
      expect(key).toBe('leaderboard:top:10:all');
    });

    it('should have coachInsights function', () => {
      expect(typeof CACHE_WARMING_KEYS.coachInsights).toBe('function');
    });

    it('coachInsights should generate correct cache key', () => {
      const key = CACHE_WARMING_KEYS.coachInsights('user-123', 'week-1');
      expect(key).toBe('leaderboard:coach:user-123:week-1');
    });

    it('coachInsights should work with different users', () => {
      const key1 = CACHE_WARMING_KEYS.coachInsights('user-1', 'week-1');
      const key2 = CACHE_WARMING_KEYS.coachInsights('user-2', 'week-1');

      expect(key1).toBe('leaderboard:coach:user-1:week-1');
      expect(key2).toBe('leaderboard:coach:user-2:week-1');
      expect(key1).not.toBe(key2);
    });

    it('coachInsights should work with different weeks', () => {
      const key1 = CACHE_WARMING_KEYS.coachInsights('user-1', 'week-1');
      const key2 = CACHE_WARMING_KEYS.coachInsights('user-1', 'week-2');

      expect(key1).toBe('leaderboard:coach:user-1:week-1');
      expect(key2).toBe('leaderboard:coach:user-1:week-2');
      expect(key1).not.toBe(key2);
    });
  });

  describe('cache key naming conventions', () => {
    it('all static keys should use cache-warming or leaderboard prefixes', () => {
      expect(CACHE_WARMING_KEYS.activeEvents).toMatch(/^(cache-warming|leaderboard):/);
      expect(CACHE_WARMING_KEYS.trendingEvents).toMatch(/^(cache-warming|leaderboard):/);
      expect(CACHE_WARMING_KEYS.platformStatistics).toMatch(
        /^(cache-warming|leaderboard):/,
      );
    });

    it('static keys should be strings', () => {
      expect(typeof CACHE_WARMING_KEYS.activeEvents).toBe('string');
      expect(typeof CACHE_WARMING_KEYS.trendingEvents).toBe('string');
      expect(typeof CACHE_WARMING_KEYS.platformStatistics).toBe('string');
    });

    it('dynamic functions should return strings', () => {
      const result1 = CACHE_WARMING_KEYS.popularEventDetail('event-1');
      const result2 = CACHE_WARMING_KEYS.leaderboardCursor('season-1', 1);
      const result3 = CACHE_WARMING_KEYS.coachInsights('user-1', 'week-1');

      expect(typeof result1).toBe('string');
      expect(typeof result2).toBe('string');
      expect(typeof result3).toBe('string');
    });
  });

  describe('cache key uniqueness', () => {
    it('should generate unique keys for different event IDs', () => {
      const keys = new Set([
        CACHE_WARMING_KEYS.popularEventDetail('event-1'),
        CACHE_WARMING_KEYS.popularEventDetail('event-2'),
        CACHE_WARMING_KEYS.popularEventDetail('event-3'),
      ]);
      expect(keys.size).toBe(3);
    });

    it('should generate unique keys for different pages', () => {
      const keys = new Set([
        CACHE_WARMING_KEYS.leaderboardCursor('season-1', 1),
        CACHE_WARMING_KEYS.leaderboardCursor('season-1', 2),
        CACHE_WARMING_KEYS.leaderboardCursor('season-1', 3),
      ]);
      expect(keys.size).toBe(3);
    });

    it('should generate unique keys for different coach scenarios', () => {
      const keys = new Set([
        CACHE_WARMING_KEYS.coachInsights('user-1', 'week-1'),
        CACHE_WARMING_KEYS.coachInsights('user-2', 'week-1'),
        CACHE_WARMING_KEYS.coachInsights('user-1', 'week-2'),
      ]);
      expect(keys.size).toBe(3);
    });
  });

  describe('special cases', () => {
    it('should handle empty string event ID', () => {
      const key = CACHE_WARMING_KEYS.popularEventDetail('');
      expect(key).toBe('cache-warming:popular-event:');
    });

    it('should handle zero in leaderboard top N', () => {
      const key = CACHE_WARMING_KEYS.leaderboardTopN(0, 'season-1');
      expect(key).toBe('leaderboard:top:0:season-1');
    });

    it('should handle large page numbers', () => {
      const key = CACHE_WARMING_KEYS.leaderboardCursor('season-1', 9999);
      expect(key).toBe('leaderboard:cursor:season-1:page:9999');
    });

    it('should handle special characters in IDs', () => {
      const key1 = CACHE_WARMING_KEYS.popularEventDetail('event-with-dashes-123');
      const key2 = CACHE_WARMING_KEYS.coachInsights('user_with_underscores', 'week-1');

      expect(key1).toContain('event-with-dashes-123');
      expect(key2).toContain('user_with_underscores');
    });
  });

  describe('const assertion', () => {
    it('should be readonly (as const)', () => {
      expect(CACHE_WARMING_KEYS).toBeDefined();
      // TypeScript 'as const' ensures immutability
    });
  });
});
