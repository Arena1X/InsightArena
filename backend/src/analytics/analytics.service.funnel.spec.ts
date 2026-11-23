import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsService } from './analytics.service';
import { User } from '../users/entities/user.entity';
import { Prediction } from '../predictions/entities/prediction.entity';
import { LeaderboardEntry } from '../leaderboard/entities/leaderboard-entry.entity';
import { Market } from '../markets/entities/market.entity';
import { ActivityLog } from './entities/activity-log.entity';
import { MarketHistory } from './entities/market-history.entity';
import { CacheService } from '../cache/cache.service';

describe('AnalyticsService - conversion funnel', () => {
  let service: AnalyticsService;
  let usersRepository: { count: jest.Mock };
  let predictionsRepository: { createQueryBuilder: jest.Mock };

  beforeEach(async () => {
    usersRepository = { count: jest.fn().mockResolvedValue(4) };

    const rawCounts = [{ count: '3' }, { count: '2' }];
    predictionsRepository = {
      createQueryBuilder: jest.fn(() => {
        const queryBuilder = {
          innerJoin: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          getRawOne: jest.fn().mockResolvedValue(rawCounts.shift()),
        };
        return queryBuilder;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        { provide: getRepositoryToken(User), useValue: usersRepository },
        {
          provide: getRepositoryToken(Prediction),
          useValue: predictionsRepository,
        },
        { provide: getRepositoryToken(LeaderboardEntry), useValue: {} },
        { provide: getRepositoryToken(Market), useValue: {} },
        { provide: getRepositoryToken(ActivityLog), useValue: {} },
        { provide: getRepositoryToken(MarketHistory), useValue: {} },
        {
          provide: CacheService,
          useValue: { getOrSet: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<AnalyticsService>(AnalyticsService);
  });

  it('returns seeded stage counts and stage-to-stage conversion rates', async () => {
    const from = new Date('2026-03-01T00:00:00.000Z');
    const to = new Date('2026-03-31T23:59:59.999Z');

    const result = await service.getConversionFunnel(from, to);

    expect(result.stages).toEqual([
      { stage: 'signup', count: 4, conversion_rate: 100 },
      { stage: 'first_prediction', count: 3, conversion_rate: 75 },
      { stage: 'payout', count: 2, conversion_rate: 66.67 },
    ]);
    expect(result.from).toBe(from);
    expect(result.to).toBe(to);
    expect(usersRepository.count).toHaveBeenCalledWith({
      where: expect.objectContaining({ created_at: expect.anything() }),
    });
    expect(predictionsRepository.createQueryBuilder).toHaveBeenCalledTimes(2);
  });

  it('returns zero conversion rates when the preceding stage has no users', async () => {
    usersRepository.count.mockResolvedValue(0);

    const result = await service.getConversionFunnel(
      new Date('2026-03-01T00:00:00.000Z'),
      new Date('2026-03-31T23:59:59.999Z'),
    );

    expect(result.stages.map((stage) => stage.conversion_rate)).toEqual([
      100, 0, 0,
    ]);
  });
});
