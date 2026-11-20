import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsService } from './analytics.service';
import { CacheService } from '../cache/cache.service';
import { getRepositoryToken } from '@nestjs/typeorm';

/**
 * Analytics Cache Invalidation Test Suite
 * Issue #2096: Ensures analytics cache is properly invalidated on state changes
 *
 * When user predictions, leaderboard standings, or market data changes,
 * cached analytics must be cleared to prevent stale data from being served.
 */
describe('AnalyticsService - Cache Invalidation (#2096)', () => {
  let analyticsService: AnalyticsService;
  let cacheService: CacheService;

  const mockCacheService = {
    set: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockResolvedValue(null),
    del: jest.fn().mockResolvedValue(0),
    deletePattern: jest.fn().mockResolvedValue(0),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        { provide: CacheService, useValue: mockCacheService },
        {
          provide: getRepositoryToken(require('../analytics/entities/analytics.entity').Analytics),
          useValue: { find: jest.fn(), create: jest.fn(), save: jest.fn() },
        },
      ],
    }).compile();

    analyticsService = module.get<AnalyticsService>(AnalyticsService);
    cacheService = module.get<CacheService>(CacheService);
  });

  describe('cache invalidation on data mutations', () => {
    it('should invalidate analytics cache when user prediction is created', async () => {
      const userId = 'user-123';

      // Simulate prediction creation triggering cache invalidation
      await analyticsService.invalidateUserAnalytics(userId);

      expect(mockCacheService.del).toHaveBeenCalledWith(expect.stringContaining(userId));
    });

    it('should invalidate leaderboard analytics cache when standings change', async () => {
      const leaderboardId = 'lb-456';

      await analyticsService.invalidateLeaderboardAnalytics(leaderboardId);

      expect(mockCacheService.del).toHaveBeenCalledWith(expect.stringContaining(leaderboardId));
    });

    it('should use wildcard pattern delete for bulk cache invalidation', async () => {
      const pattern = 'analytics:*';

      await analyticsService.invalidateAllAnalytics();

      expect(mockCacheService.deletePattern).toHaveBeenCalledWith(pattern);
    });

    it('should not throw when cache invalidation fails', async () => {
      mockCacheService.del.mockRejectedValueOnce(new Error('Cache unavailable'));

      // Should not throw, gracefully handle cache service failures
      await expect(
        analyticsService.invalidateUserAnalytics('user-789'),
      ).resolves.not.toThrow();
    });
  });

  describe('cache retrieval with stale-while-revalidate', () => {
    it('should return stale cache while revalidating in background', async () => {
      const cacheKey = 'analytics:user-123';
      const staleData = { predictions: 5, accuracy: 0.65 };

      mockCacheService.get.mockResolvedValueOnce(staleData);

      const result = await analyticsService.getUserAnalytics('user-123', {
        allowStale: true,
      });

      expect(result).toEqual(staleData);
      expect(mockCacheService.get).toHaveBeenCalledWith(cacheKey);
    });

    it('should cache fresh analytics for subsequent requests', async () => {
      const userId = 'user-123';
      const freshAnalytics = { predictions: 10, accuracy: 0.72 };

      mockCacheService.set.mockResolvedValueOnce(undefined);

      await analyticsService.getUserAnalytics(userId);

      expect(mockCacheService.set).toHaveBeenCalled();
    });
  });
});
