import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  getCacheWarmingStrategy,
  CacheWarmingStrategy,
} from './cache-warming.config';

describe('cache-warming.config', () => {
  let configService: ConfigService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
      ],
    }).compile();

    configService = module.get(ConfigService);
  });

  describe('getCacheWarmingStrategy', () => {
    it('should be defined', () => {
      expect(getCacheWarmingStrategy).toBeDefined();
    });

    it('should return a valid CacheWarmingStrategy object', () => {
      jest.spyOn(configService, 'get').mockReturnValue(undefined);

      const strategy = getCacheWarmingStrategy(configService);

      expect(strategy).toBeDefined();
      expect(strategy.enabled).toBeDefined();
      expect(strategy.ttlSeconds).toBeDefined();
      expect(strategy.activeEventsLimit).toBeDefined();
      expect(strategy.trendingEventsLimit).toBeDefined();
      expect(strategy.popularEventDetailsLimit).toBeDefined();
      expect(strategy.leaderboardTopN).toBeDefined();
      expect(strategy.leaderboardSeasonIds).toBeDefined();
    });

    it('should use default values when config is not provided', () => {
      jest.spyOn(configService, 'get').mockReturnValue(undefined);

      const strategy = getCacheWarmingStrategy(configService);

      expect(strategy.enabled).toBe(true);
      expect(strategy.ttlSeconds).toBe(600);
      expect(strategy.activeEventsLimit).toBe(20);
      expect(strategy.trendingEventsLimit).toBe(20);
      expect(strategy.popularEventDetailsLimit).toBe(5);
      expect(strategy.leaderboardTopN).toEqual([10, 20]);
    });

    it('should respect CACHE_WARMING_ENABLED config', () => {
      jest.spyOn(configService, 'get').mockImplementation((key: string) => {
        if (key === 'CACHE_WARMING_ENABLED') return 'false';
        return undefined;
      });

      const strategy = getCacheWarmingStrategy(configService);

      expect(strategy.enabled).toBe(false);
    });

    it('should enable cache warming when CACHE_WARMING_ENABLED is not "false"', () => {
      jest.spyOn(configService, 'get').mockImplementation((key: string) => {
        if (key === 'CACHE_WARMING_ENABLED') return 'true';
        return undefined;
      });

      const strategy = getCacheWarmingStrategy(configService);

      expect(strategy.enabled).toBe(true);
    });

    it('should parse CACHE_WARMING_TTL_SECONDS correctly', () => {
      jest.spyOn(configService, 'get').mockImplementation((key: string) => {
        if (key === 'CACHE_WARMING_TTL_SECONDS') return '1200';
        return undefined;
      });

      const strategy = getCacheWarmingStrategy(configService);

      expect(strategy.ttlSeconds).toBe(1200);
    });

    it('should use default TTL when value is invalid', () => {
      jest.spyOn(configService, 'get').mockImplementation((key: string) => {
        if (key === 'CACHE_WARMING_TTL_SECONDS') return 'invalid';
        return undefined;
      });

      const strategy = getCacheWarmingStrategy(configService);

      expect(strategy.ttlSeconds).toBe(600);
    });

    it('should parse CACHE_WARMING_ACTIVE_EVENTS_LIMIT', () => {
      jest.spyOn(configService, 'get').mockImplementation((key: string) => {
        if (key === 'CACHE_WARMING_ACTIVE_EVENTS_LIMIT') return '50';
        return undefined;
      });

      const strategy = getCacheWarmingStrategy(configService);

      expect(strategy.activeEventsLimit).toBe(50);
    });

    it('should parse CACHE_WARMING_TRENDING_EVENTS_LIMIT', () => {
      jest.spyOn(configService, 'get').mockImplementation((key: string) => {
        if (key === 'CACHE_WARMING_TRENDING_EVENTS_LIMIT') return '30';
        return undefined;
      });

      const strategy = getCacheWarmingStrategy(configService);

      expect(strategy.trendingEventsLimit).toBe(30);
    });

    it('should parse CACHE_WARMING_POPULAR_EVENT_DETAILS_LIMIT', () => {
      jest.spyOn(configService, 'get').mockImplementation((key: string) => {
        if (key === 'CACHE_WARMING_POPULAR_EVENT_DETAILS_LIMIT') return '10';
        return undefined;
      });

      const strategy = getCacheWarmingStrategy(configService);

      expect(strategy.popularEventDetailsLimit).toBe(10);
    });

    it('should parse CACHE_WARMING_LEADERBOARD_TOP_N as comma-separated values', () => {
      jest.spyOn(configService, 'get').mockImplementation((key: string) => {
        if (key === 'CACHE_WARMING_LEADERBOARD_TOP_N') return '5,10,15';
        return undefined;
      });

      const strategy = getCacheWarmingStrategy(configService);

      expect(strategy.leaderboardTopN).toEqual([5, 10, 15]);
    });

    it('should use defaults for leaderboard top N when not specified', () => {
      jest.spyOn(configService, 'get').mockReturnValue(undefined);

      const strategy = getCacheWarmingStrategy(configService);

      expect(strategy.leaderboardTopN).toEqual([10, 20]);
    });

    it('should filter invalid values from leaderboard top N', () => {
      jest.spyOn(configService, 'get').mockImplementation((key: string) => {
        if (key === 'CACHE_WARMING_LEADERBOARD_TOP_N') return '5,invalid,15';
        return undefined;
      });

      const strategy = getCacheWarmingStrategy(configService);

      expect(strategy.leaderboardTopN).toEqual([5, 15]);
    });

    it('should parse CACHE_WARMING_LEADERBOARD_SEASON_IDS as comma-separated values', () => {
      jest.spyOn(configService, 'get').mockImplementation((key: string) => {
        if (key === 'CACHE_WARMING_LEADERBOARD_SEASON_IDS')
          return 'season1,season2';
        if (key === 'CACHE_WARMING_LEADERBOARD_TOP_N') return '10,20';
        return undefined;
      });

      const strategy = getCacheWarmingStrategy(configService);

      expect(strategy.leaderboardSeasonIds).toEqual(['season1', 'season2']);
    });

    it('should have empty leaderboard season IDs when not specified', () => {
      jest.spyOn(configService, 'get').mockImplementation((key: string) => {
        if (key === 'CACHE_WARMING_LEADERBOARD_SEASON_IDS') return '';
        if (key === 'CACHE_WARMING_LEADERBOARD_TOP_N') return '10,20';
        return undefined;
      });

      const strategy = getCacheWarmingStrategy(configService);

      expect(strategy.leaderboardSeasonIds).toEqual([]);
    });

    it('should trim whitespace from season IDs', () => {
      jest.spyOn(configService, 'get').mockImplementation((key: string) => {
        if (key === 'CACHE_WARMING_LEADERBOARD_SEASON_IDS')
          return '  season1 , season2  ';
        if (key === 'CACHE_WARMING_LEADERBOARD_TOP_N') return '10,20';
        return undefined;
      });

      const strategy = getCacheWarmingStrategy(configService);

      expect(strategy.leaderboardSeasonIds).toEqual(['season1', 'season2']);
    });

    it('should handle all positive numeric limits', () => {
      jest.spyOn(configService, 'get').mockImplementation((key: string) => {
        const config: Record<string, string> = {
          CACHE_WARMING_ACTIVE_EVENTS_LIMIT: '100',
          CACHE_WARMING_TRENDING_EVENTS_LIMIT: '100',
          CACHE_WARMING_POPULAR_EVENT_DETAILS_LIMIT: '50',
          CACHE_WARMING_TTL_SECONDS: '3600',
        };
        return config[key];
      });

      const strategy = getCacheWarmingStrategy(configService);

      expect(strategy.activeEventsLimit).toBe(100);
      expect(strategy.trendingEventsLimit).toBe(100);
      expect(strategy.popularEventDetailsLimit).toBe(50);
      expect(strategy.ttlSeconds).toBe(3600);
    });

    it('should return strategy with all required properties', () => {
      jest.spyOn(configService, 'get').mockReturnValue(undefined);

      const strategy = getCacheWarmingStrategy(configService);

      const keys: (keyof CacheWarmingStrategy)[] = [
        'enabled',
        'ttlSeconds',
        'activeEventsLimit',
        'trendingEventsLimit',
        'popularEventDetailsLimit',
        'leaderboardTopN',
        'leaderboardSeasonIds',
      ];

      keys.forEach((key) => {
        expect(strategy).toHaveProperty(key);
      });
    });
  });
});
