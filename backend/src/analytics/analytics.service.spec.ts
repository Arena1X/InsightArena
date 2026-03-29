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

describe('predictorTierFromReputation', () => {
  it('maps thresholds to tier labels', () => {
    expect(predictorTierFromReputation(0)).toBe('Bronze Predictor');
    expect(predictorTierFromReputation(199)).toBe('Bronze Predictor');
    expect(predictorTierFromReputation(200)).toBe('Silver Predictor');
    expect(predictorTierFromReputation(499)).toBe('Silver Predictor');
    expect(predictorTierFromReputation(500)).toBe('Gold Predictor');
    expect(predictorTierFromReputation(999)).toBe('Gold Predictor');
    expect(predictorTierFromReputation(1000)).toBe('Platinum Predictor');
    expect(predictorTierFromReputation(840)).toBe('Gold Predictor');
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
  let usersRepository: jest.Mocked<Pick<Repository<User>, 'findOne'>>;
  let predictionsRepository: jest.Mocked<
    Pick<Repository<Prediction>, 'createQueryBuilder'>
  >;
  let leaderboardRepository: jest.Mocked<
    Pick<Repository<LeaderboardEntry>, 'createQueryBuilder'>
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

    const module: TestingModule = await Test.createTestingModule({
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

    const result = await service.getDashboard({
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

    const result = await service.getDashboard({ id: baseUser.id } as User);

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

    const result = await service.getDashboard({ id: baseUser.id } as User);
    expect(result.current_streak).toBe(0);
  });
});
