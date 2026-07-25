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

    module = await Test.createTestingModule({
      providers: [
        AnalyticsService,
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
          useValue: { findOne: jest.fn(), find: jest.fn() },
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
});
