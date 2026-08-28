import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import {
  AnalyticsService,
  accuracyRateFromUser,
  predictorTierFromReputation,
} from './analytics.service';
import { User } from '../users/entities/user.entity';
import { Prediction } from '../predictions/entities/prediction.entity';
import { LeaderboardEntry } from '../leaderboard/entities/leaderboard-entry.entity';
import { Market } from '../markets/entities/market.entity';
import { ActivityLog } from './entities/activity-log.entity';
import { MarketHistory } from './entities/market-history.entity';
import { CacheService } from '../cache/cache.service';
import { CACHE_MANAGER } from '@nestjs/cache-manager';

describe('predictorTierFromReputation', () => {
  it('maps 0 to Bronze Predictor', () => {
    expect(predictorTierFromReputation(0)).toBe('Bronze Predictor');
  });

  it('maps 199 to Bronze Predictor', () => {
    expect(predictorTierFromReputation(199)).toBe('Bronze Predictor');
  });

  it('maps 200 to Silver Predictor', () => {
    expect(predictorTierFromReputation(200)).toBe('Silver Predictor');
  });

  it('maps 499 to Silver Predictor', () => {
    expect(predictorTierFromReputation(499)).toBe('Silver Predictor');
  });

  it('maps 500 to Gold Predictor', () => {
    expect(predictorTierFromReputation(500)).toBe('Gold Predictor');
  });

  it('maps 999 to Gold Predictor', () => {
    expect(predictorTierFromReputation(999)).toBe('Gold Predictor');
  });

  it('maps 1000 to Platinum Predictor', () => {
    expect(predictorTierFromReputation(1000)).toBe('Platinum Predictor');
  });
});

describe('accuracyRateFromUser', () => {
  it('returns 0.0 when there are no predictions', () => {
    const u = { total_predictions: 0, correct_predictions: 0 } as User;
    expect(accuracyRateFromUser(u)).toBe('0.0');
  });

  it('formats one decimal place', () => {
    const u = {
      total_predictions: 3,
      correct_predictions: 2,
    } as User;
    expect(accuracyRateFromUser(u)).toBe('66.7');
  });
});

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let module: TestingModule;
  let usersRepository: jest.Mocked<Pick<Repository<User>, 'findOne'>>;
  let predictionsRepository: jest.Mocked<
    Pick<Repository<Prediction>, 'createQueryBuilder'>
  >;
  let leaderboardRepository: jest.Mocked<
    Pick<Repository<LeaderboardEntry>, 'createQueryBuilder'>
  >;
  let marketHistoryRepository: jest.Mocked<
    Pick<Repository<MarketHistory>, 'createQueryBuilder'>
  >;
  let marketsRepository: {
    find: jest.Mock;
    findOne: jest.Mock;
    count: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let cacheService: CacheService;

  const baseUser: User = {
    id: 'user-id-1',
    stellar_address: 'GADDR',
    username: 'u',
    avatar_url: null,
    total_predictions: 10,
    correct_predictions: 7,
    total_staked_stroops: '0',
    total_winnings_stroops: '1240000000',
    reputation_score: 840,
    season_points: 0,
    role: 'user',
    is_banned: false,
    ban_reason: null,
    banned_at: null,
    banned_by: null,
    created_at: new Date(),
    updated_at: new Date(),
  } as User;

  beforeEach(async () => {
    usersRepository = { findOne: jest.fn() };
    leaderboardRepository = { createQueryBuilder: jest.fn() };
    predictionsRepository = { createQueryBuilder: jest.fn() };
    marketHistoryRepository = { createQueryBuilder: jest.fn() };
    marketsRepository = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      createQueryBuilder: jest.fn(),
    };

    // Minimal in-memory cache-manager fake so CacheService's TTL/single-flight
    // logic runs for real against these tests, rather than being stubbed out.
    const store = new Map<string, unknown>();
    const fakeCacheManager = {
      get: jest.fn((key: string) => Promise.resolve(store.get(key))),
      set: jest.fn((key: string, value: unknown) => {
        store.set(key, value);
        return Promise.resolve();
      }),
      del: jest.fn((key: string) => {
        store.delete(key);
        return Promise.resolve();
      }),
    };

    module = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        CacheService,
        { provide: CACHE_MANAGER, useValue: fakeCacheManager },
        { provide: getRepositoryToken(User), useValue: usersRepository },
        {
          provide: getRepositoryToken(Prediction),
          useValue: predictionsRepository,
        },
        {
          provide: getRepositoryToken(LeaderboardEntry),
          useValue: leaderboardRepository,
        },
        {
          provide: getRepositoryToken(Market),
          useValue: marketsRepository,
        },
        {
          provide: getRepositoryToken(ActivityLog),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            findAndCount: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(MarketHistory),
          useValue: marketHistoryRepository,
        },
      ],
    }).compile();

    service = module.get(AnalyticsService);
    cacheService = module.get(CacheService);
  });

  function mockQb(terminal: { getCount?: number; getMany?: Prediction[] }) {
    const chain = {
      innerJoin: jest.fn().mockReturnThis(),
      innerJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(terminal.getCount ?? 0),
      getMany: jest.fn().mockResolvedValue(terminal.getMany ?? []),
    };
    return chain as unknown;
  }

  function mockLeaderboardQb(entry: LeaderboardEntry | null) {
    return {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(entry),
    } as unknown;
  }

  it('aggregates KPIs from user, leaderboard entry, and predictions', async () => {
    usersRepository.findOne.mockResolvedValue(baseUser);
    leaderboardRepository.createQueryBuilder.mockReturnValue(
      mockLeaderboardQb({
        rank: 24,
      } as LeaderboardEntry) as SelectQueryBuilder<LeaderboardEntry>,
    );

    const market = {
      is_resolved: true,
      is_cancelled: false,
      resolved_outcome: 'Yes',
      resolution_time: new Date('2025-01-02'),
    } as Market;

    const winPred = {
      chosen_outcome: 'Yes',
      market,
    } as Prediction;

    let call = 0;
    predictionsRepository.createQueryBuilder.mockImplementation(() => {
      call += 1;
      if (call === 1)
        return mockQb({
          getCount: 5,
        }) as SelectQueryBuilder<Prediction>;
      return mockQb({
        getMany: [winPred, winPred, winPred, winPred],
      }) as SelectQueryBuilder<Prediction>;
    });

    const result = await service.getDashboardKPIs({
      id: baseUser.id,
    } as User);

    expect(result).toEqual({
      total_predictions: 10,
      accuracy_rate: '70.0',
      current_rank: 24,
      total_rewards_earned_stroops: '1240000000',
      active_predictions_count: 5,
      current_streak: 4,
      reputation_score: 840,
      tier: 'Gold Predictor',
    });
  });

  it('uses rank 0 when there is no global leaderboard row', async () => {
    usersRepository.findOne.mockResolvedValue(baseUser);
    leaderboardRepository.createQueryBuilder.mockReturnValue(
      mockLeaderboardQb(null) as SelectQueryBuilder<LeaderboardEntry>,
    );

    let call = 0;
    predictionsRepository.createQueryBuilder.mockImplementation(() => {
      call += 1;
      if (call === 1)
        return mockQb({
          getCount: 0,
        }) as SelectQueryBuilder<Prediction>;
      return mockQb({
        getMany: [],
      }) as SelectQueryBuilder<Prediction>;
    });

    const result = await service.getDashboardKPIs({ id: baseUser.id } as User);

    expect(result.current_rank).toBe(0);
    expect(result.current_streak).toBe(0);
  });

  it('breaks streak on first loss in resolution order', async () => {
    usersRepository.findOne.mockResolvedValue(baseUser);
    leaderboardRepository.createQueryBuilder.mockReturnValue(
      mockLeaderboardQb(null) as SelectQueryBuilder<LeaderboardEntry>,
    );

    const mYes = {
      is_resolved: true,
      is_cancelled: false,
      resolved_outcome: 'Yes',
      resolution_time: new Date('2025-01-03'),
    } as Market;
    const mNo = {
      is_resolved: true,
      is_cancelled: false,
      resolved_outcome: 'No',
      resolution_time: new Date('2025-01-02'),
    } as Market;

    let call = 0;
    predictionsRepository.createQueryBuilder.mockImplementation(() => {
      call += 1;
      if (call === 1)
        return mockQb({
          getCount: 0,
        }) as SelectQueryBuilder<Prediction>;
      return mockQb({
        getMany: [
          { chosen_outcome: 'No', market: mYes } as Prediction,
          { chosen_outcome: 'Yes', market: mNo } as Prediction,
        ],
      }) as SelectQueryBuilder<Prediction>;
    });

    const result = await service.getDashboardKPIs({ id: baseUser.id } as User);
    expect(result.current_streak).toBe(0);
  });

  describe('getMarketHistory', () => {
    it('should return market history in the requested format', async () => {
      const mockMarket = { id: 'market-1', title: 'Market 1' } as Market;
      const mockHistory = [
        {
          recorded_at: new Date(),
          pool_size_stroops: '1000',
          participant_count: 5,
          outcome_probabilities: ['60.00', '40.00'],
        } as MarketHistory,
      ];

      const marketsRepository = module.get(getRepositoryToken(Market));
      const marketHistoryRepository = module.get(
        getRepositoryToken(MarketHistory),
      );

      jest.spyOn(marketsRepository, 'findOne').mockResolvedValue(mockMarket);

      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(mockHistory),
      };
      jest
        .spyOn(marketHistoryRepository, 'createQueryBuilder')
        .mockReturnValue(qb as any);

      const from = new Date('2026-05-01T00:00:00.000Z');
      const to = new Date('2026-06-01T00:00:00.000Z');
      const result = await service.getMarketHistory('market-1', from, to);

      expect(result.market_id).toBe('market-1');
      expect(result.history).toHaveLength(1);
      expect(result.history[0]).toEqual({
        timestamp: mockHistory[0].recorded_at,
        prediction_volume: undefined, // default for mock
        pool_size_stroops: '1000',
        participant_count: 5,
        outcome_probabilities: [60, 40],
      });
      expect(qb.andWhere).toHaveBeenCalledWith('history.recorded_at >= :from', {
        from,
      });
      expect(qb.andWhere).toHaveBeenCalledWith('history.recorded_at <= :to', {
        to,
      });
    });

    it('should throw NotFoundException for invalid market', async () => {
      const marketsRepository = module.get(getRepositoryToken(Market));
      jest.spyOn(marketsRepository, 'findOne').mockResolvedValue(null);

      await expect(
        service.getMarketHistory(
          'invalid',
          new Date('2026-05-01T00:00:00.000Z'),
          new Date('2026-06-01T00:00:00.000Z'),
        ),
      ).rejects.toThrow('Market "invalid" not found');
    });
  });

  describe('getDashboardKPIs active predictions count', () => {
    it('All active test: mock the QB to return 3 predictions on open markets -> active_predictions_count = 3', async () => {
      usersRepository.findOne.mockResolvedValue(baseUser);
      leaderboardRepository.createQueryBuilder.mockReturnValue(
        mockLeaderboardQb(null) as any,
      );
      const qb = mockQb({ getCount: 3 });
      predictionsRepository.createQueryBuilder.mockReturnValue(qb as any);

      const res = await service.getDashboardKPIs(baseUser);

      expect(res.active_predictions_count).toBe(3);
      expect(qb.andWhere).toHaveBeenCalledWith('market.is_resolved = false');
      expect(qb.andWhere).toHaveBeenCalledWith('market.is_cancelled = false');
    });

    it('Mix test: 2 open, 1 resolved, 1 cancelled -> active_predictions_count = 2', async () => {
      usersRepository.findOne.mockResolvedValue(baseUser);
      leaderboardRepository.createQueryBuilder.mockReturnValue(
        mockLeaderboardQb(null) as any,
      );
      const qb = mockQb({ getCount: 2 });
      predictionsRepository.createQueryBuilder.mockReturnValue(qb as any);

      const res = await service.getDashboardKPIs(baseUser);

      expect(res.active_predictions_count).toBe(2);
      expect(qb.andWhere).toHaveBeenCalledWith('market.is_resolved = false');
      expect(qb.andWhere).toHaveBeenCalledWith('market.is_cancelled = false');
    });
  });

  describe('Active Sessions', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });
    afterEach(() => {
      jest.useRealTimers();
    });

    it('tracks active sessions and decays idle ones', () => {
      service.trackActiveSession('user1');
      service.trackActiveSession('user2');

      expect(service.getActiveUsersCount()).toBe(2);

      jest.advanceTimersByTime(200_000);
      service.trackActiveSession('user2');

      jest.advanceTimersByTime(200_000);
      // user1 is now idle for 400s (decay threshold is 300s)
      expect(service.getActiveUsersCount()).toBe(1);

      service.removeActiveSession('user2');
      expect(service.getActiveUsersCount()).toBe(0);
    });
  });

  describe('getCategoryAnalytics caching (stampede protection)', () => {
    it('recomputes once for concurrent calls on a cold cache', async () => {
      marketsRepository.find.mockResolvedValue([]);

      await Promise.all([
        service.getCategoryAnalytics(),
        service.getCategoryAnalytics(),
        service.getCategoryAnalytics(),
      ]);

      expect(marketsRepository.find).toHaveBeenCalledTimes(1);
    });

    it('serves from cache without recomputing on a subsequent call', async () => {
      marketsRepository.find.mockResolvedValue([]);

      await service.getCategoryAnalytics();
      await service.getCategoryAnalytics();

      expect(marketsRepository.find).toHaveBeenCalledTimes(1);
    });

    it('recomputes again once the cached entry is invalidated', async () => {
      marketsRepository.find.mockResolvedValue([]);

      await service.getCategoryAnalytics();
      await cacheService.invalidate('analytics:category', 'all');
      await service.getCategoryAnalytics();

      expect(marketsRepository.find).toHaveBeenCalledTimes(2);
    });
  });

  describe('getMarketAnalytics caching', () => {
    function makeMarket(id: string): Market {
      return {
        id,
        on_chain_market_id: `chain-${id}`,
        title: `Market ${id}`,
        outcome_options: ['YES', 'NO'],
        total_pool_stroops: '1000',
        participant_count: 2,
        end_time: new Date(Date.now() + 60_000),
      } as Market;
    }

    it('serves a second identical request from cache without re-querying', async () => {
      const predictionsRepo = module.get(getRepositoryToken(Prediction));
      predictionsRepo.find = jest.fn().mockResolvedValue([]);
      marketsRepository.findOne.mockResolvedValue(makeMarket('market-1'));

      const first = await service.getMarketAnalytics('market-1');
      const second = await service.getMarketAnalytics('market-1');

      expect(second).toEqual(first);
      expect(marketsRepository.findOne).toHaveBeenCalledTimes(1);
      expect(predictionsRepo.find).toHaveBeenCalledTimes(1);
    });

    it('uses a distinct cache entry for a different market id', async () => {
      const predictionsRepo = module.get(getRepositoryToken(Prediction));
      predictionsRepo.find = jest.fn().mockResolvedValue([]);
      marketsRepository.findOne
        .mockResolvedValueOnce(makeMarket('market-1'))
        .mockResolvedValueOnce(makeMarket('market-2'));

      const first = await service.getMarketAnalytics('market-1');
      const second = await service.getMarketAnalytics('market-2');

      expect(first.market_id).toBe('market-1');
      expect(second.market_id).toBe('market-2');
      expect(marketsRepository.findOne).toHaveBeenCalledTimes(2);
      expect(predictionsRepo.find).toHaveBeenCalledTimes(2);
    });
  });

  describe('getUserTrends caching', () => {
    const trendsUser = { id: 'user-42', stellar_address: 'GADDR42' } as User;

    function makePrediction(): Prediction {
      return {
        submitted_at: new Date(),
        chosen_outcome: 'YES',
        stake_amount_stroops: '100',
        payout_amount_stroops: '0',
        market: { category: 'Politics', is_resolved: false } as Market,
      } as Prediction;
    }

    function setup() {
      const predictionsRepo = module.get(getRepositoryToken(Prediction));
      predictionsRepo.find = jest.fn().mockResolvedValue([makePrediction()]);
      usersRepository.findOne.mockResolvedValue(trendsUser);
      return predictionsRepo;
    }

    it('serves a second identical request from cache without re-querying', async () => {
      const predictionsRepo = setup();

      await service.getUserTrends('GADDR42', 30);
      await service.getUserTrends('GADDR42', 30);

      expect(predictionsRepo.find).toHaveBeenCalledTimes(1);
    });

    it('uses a distinct cache entry when the days parameter differs', async () => {
      const predictionsRepo = setup();

      await service.getUserTrends('GADDR42', 30);
      await service.getUserTrends('GADDR42', 60);

      expect(predictionsRepo.find).toHaveBeenCalledTimes(2);
    });

    it('uses a distinct cache entry for a different address', async () => {
      const predictionsRepo = setup();

      await service.getUserTrends('GADDR42', 30);
      await service.getUserTrends('GOTHER99', 30);

      expect(predictionsRepo.find).toHaveBeenCalledTimes(2);
    });
  });

  describe('getDashboardKPIs caching', () => {
    it('serves a second identical request from cache without re-querying', async () => {
      usersRepository.findOne.mockResolvedValue(baseUser);
      leaderboardRepository.createQueryBuilder.mockReturnValue(
        mockLeaderboardQb(null) as any,
      );
      predictionsRepository.createQueryBuilder.mockReturnValue(
        mockQb({ getCount: 1 }) as any,
      );

      await service.getDashboardKPIs(baseUser);
      await service.getDashboardKPIs(baseUser);

      expect(usersRepository.findOne).toHaveBeenCalledTimes(1);
    });

    it('uses a distinct cache entry for a different user', async () => {
      const otherUser = { ...baseUser, id: 'user-id-2' } as User;
      usersRepository.findOne.mockImplementation((opts: any) =>
        Promise.resolve(
          opts.where.id === otherUser.id ? otherUser : baseUser,
        ),
      );
      leaderboardRepository.createQueryBuilder.mockReturnValue(
        mockLeaderboardQb(null) as any,
      );
      predictionsRepository.createQueryBuilder.mockReturnValue(
        mockQb({ getCount: 1 }) as any,
      );

      await service.getDashboardKPIs(baseUser);
      await service.getDashboardKPIs(otherUser);

      expect(usersRepository.findOne).toHaveBeenCalledTimes(2);
    });
  });

  describe('getMarketHistory caching', () => {
    function makeHistoryQb() {
      return {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };
    }

    it('serves a second identical request from cache without re-querying', async () => {
      const market = { id: 'market-1', title: 'Market 1' } as Market;
      marketsRepository.findOne.mockResolvedValue(market);
      marketHistoryRepository.createQueryBuilder.mockReturnValue(
        makeHistoryQb() as any,
      );

      const from = new Date('2026-05-01T00:00:00.000Z');
      const to = new Date('2026-06-01T00:00:00.000Z');

      const first = await service.getMarketHistory('market-1', from, to);
      const second = await service.getMarketHistory('market-1', from, to);

      expect(second).toEqual(first);
      expect(marketsRepository.findOne).toHaveBeenCalledTimes(1);
      expect(
        marketHistoryRepository.createQueryBuilder,
      ).toHaveBeenCalledTimes(1);
    });

    it('uses a distinct cache entry when the date range differs', async () => {
      const market = { id: 'market-1', title: 'Market 1' } as Market;
      marketsRepository.findOne.mockResolvedValue(market);
      marketHistoryRepository.createQueryBuilder.mockReturnValue(
        makeHistoryQb() as any,
      );

      await service.getMarketHistory(
        'market-1',
        new Date('2026-05-01T00:00:00.000Z'),
        new Date('2026-06-01T00:00:00.000Z'),
      );
      await service.getMarketHistory(
        'market-1',
        new Date('2026-06-01T00:00:00.000Z'),
        new Date('2026-07-01T00:00:00.000Z'),
      );

      expect(
        marketHistoryRepository.createQueryBuilder,
      ).toHaveBeenCalledTimes(2);
    });

    it('uses a distinct cache entry for a different market id', async () => {
      marketsRepository.findOne.mockImplementation((opts: any) =>
        Promise.resolve({ id: opts.where[0].id, title: 'Market' } as Market),
      );
      marketHistoryRepository.createQueryBuilder.mockReturnValue(
        makeHistoryQb() as any,
      );

      const from = new Date('2026-05-01T00:00:00.000Z');
      const to = new Date('2026-06-01T00:00:00.000Z');

      await service.getMarketHistory('market-1', from, to);
      await service.getMarketHistory('market-2', from, to);

      expect(
        marketHistoryRepository.createQueryBuilder,
      ).toHaveBeenCalledTimes(2);
    });
  });

  describe('invalidateMarketResolutionCaches', () => {
    it('clears the market, category, platform-stats, and per-user dashboard entries', async () => {
      const cacheManager = module.get(CACHE_MANAGER);

      await cacheService.getOrSet('analytics:market', 'market-1', () =>
        Promise.resolve('market-by-id'),
      );
      await cacheService.getOrSet('analytics:market', 'chain-1', () =>
        Promise.resolve('market-by-chain-id'),
      );
      await cacheService.getOrSet('analytics:category', 'all', () =>
        Promise.resolve('category'),
      );
      await cacheService.getOrSet('analytics:platform-stats', 'all', () =>
        Promise.resolve('platform'),
      );
      await cacheService.getOrSet('analytics:dashboard', 'user-1', () =>
        Promise.resolve('dash-1'),
      );
      await cacheService.getOrSet('analytics:dashboard', 'user-2', () =>
        Promise.resolve('dash-2'),
      );
      // Left alone: keyed by an unbounded parameter space, expires on its own TTL.
      await cacheService.getOrSet(
        'analytics:user-trends',
        'GADDR:30',
        () => Promise.resolve('trends'),
      );

      await service.invalidateMarketResolutionCaches('market-1', 'chain-1', [
        'user-1',
        'user-2',
      ]);

      expect(
        await cacheManager.get('analytics:market:market-1'),
      ).toBeUndefined();
      expect(
        await cacheManager.get('analytics:market:chain-1'),
      ).toBeUndefined();
      expect(
        await cacheManager.get('analytics:category:all'),
      ).toBeUndefined();
      expect(
        await cacheManager.get('analytics:platform-stats:all'),
      ).toBeUndefined();
      expect(
        await cacheManager.get('analytics:dashboard:user-1'),
      ).toBeUndefined();
      expect(
        await cacheManager.get('analytics:dashboard:user-2'),
      ).toBeUndefined();
      expect(await cacheManager.get('analytics:user-trends:GADDR:30')).toBe(
        'trends',
      );
    });

    it('is a no-op when no on-chain id or affected users are given', async () => {
      const cacheManager = module.get(CACHE_MANAGER);
      await cacheService.getOrSet('analytics:market', 'market-1', () =>
        Promise.resolve('market-by-id'),
      );

      await service.invalidateMarketResolutionCaches('market-1', null, []);

      expect(
        await cacheManager.get('analytics:market:market-1'),
      ).toBeUndefined();
      expect(
        await cacheManager.get('analytics:category:all'),
      ).toBeUndefined();
    });

    it('logs a warning instead of throwing when a cache backend call fails', async () => {
      const cacheManager = module.get(CACHE_MANAGER);
      const warnSpy = jest
        .spyOn((service as any).logger, 'warn')
        .mockImplementation(() => undefined);
      jest
        .spyOn(cacheManager, 'del')
        .mockRejectedValueOnce(new Error('cache backend unavailable'));

      await expect(
        service.invalidateMarketResolutionCaches('market-1', 'chain-1', []),
      ).resolves.toBeUndefined();

      expect(warnSpy).toHaveBeenCalled();
    });
  });
});
