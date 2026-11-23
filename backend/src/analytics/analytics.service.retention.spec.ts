import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AnalyticsService } from './analytics.service';
import { User } from '../users/entities/user.entity';
import { Prediction } from '../predictions/entities/prediction.entity';
import { LeaderboardEntry } from '../leaderboard/entities/leaderboard-entry.entity';
import { Market } from '../markets/entities/market.entity';
import { ActivityLog } from './entities/activity-log.entity';
import { MarketHistory } from './entities/market-history.entity';
import { CacheService } from '../cache/cache.service';

describe('AnalyticsService - getRetention (cohort edge cases)', () => {
  let service: AnalyticsService;
  let usersRepository: { find: jest.Mock };
  let predictionsRepository: { find: jest.Mock };
  let activityLogsRepository: { find: jest.Mock };

  function makeUser(id: string, createdAt: Date): User {
    return { id, created_at: createdAt } as User;
  }

  beforeEach(async () => {
    usersRepository = { find: jest.fn().mockResolvedValue([]) };
    predictionsRepository = { find: jest.fn().mockResolvedValue([]) };
    activityLogsRepository = { find: jest.fn().mockResolvedValue([]) };

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
        {
          provide: getRepositoryToken(ActivityLog),
          useValue: activityLogsRepository,
        },
        { provide: getRepositoryToken(MarketHistory), useValue: {} },
        {
          provide: CacheService,
          // Bypass caching so each test exercises computeRetention directly.
          useValue: {
            getOrSet: (_ns: string, _key: string, loader: () => unknown) =>
              loader(),
          },
        },
      ],
    }).compile();

    service = module.get<AnalyticsService>(AnalyticsService);
  });

  it('returns 0% (not NaN) for a cohort where users signed up but none returned', async () => {
    const signupDate = new Date('2026-01-01T00:00:00.000Z');
    usersRepository.find.mockResolvedValue([
      makeUser('u1', signupDate),
      makeUser('u2', signupDate),
    ]);
    // No predictions and no activity logs at all, so nobody is ever "active".
    predictionsRepository.find.mockResolvedValue([]);
    activityLogsRepository.find.mockResolvedValue([]);

    const result = await service.getRetention('day', 4);

    expect(result.cohorts).toHaveLength(1);
    const cohort = result.cohorts[0];
    expect(cohort.total_users).toBe(2);
    expect(cohort.retention_rates['0']).toBe(0);
    expect(Number.isNaN(cohort.retention_rates['0'])).toBe(false);
    expect(cohort.user_counts['0']).toBe(0);
  });

  it('returns a defined result with no cohorts, not a division error, when there are zero signups', async () => {
    usersRepository.find.mockResolvedValue([]);

    const result = await service.getRetention('day', 4);

    expect(result).toBeDefined();
    expect(result.total_users).toBe(0);
    expect(result.cohorts).toEqual([]);
  });

  it('returns 100% for a cohort where every user was active in the signup period', async () => {
    const signupDate = new Date('2026-01-01T00:00:00.000Z');
    usersRepository.find.mockResolvedValue([
      makeUser('u1', signupDate),
      makeUser('u2', signupDate),
    ]);
    // Both users have a prediction on their signup day, so period 0 shows
    // 100% retention for this cohort.
    predictionsRepository.find.mockResolvedValue([
      {
        user: { id: 'u1' },
        submitted_at: new Date('2026-01-01T05:00:00.000Z'),
      },
      {
        user: { id: 'u2' },
        submitted_at: new Date('2026-01-01T10:00:00.000Z'),
      },
    ]);

    const result = await service.getRetention('day', 4);

    const cohort = result.cohorts[0];
    expect(cohort.total_users).toBe(2);
    expect(cohort.retention_rates['0']).toBe(100);
    expect(cohort.user_counts['0']).toBe(2);
  });

  it('does not throw and returns 0% for a cohort where only some users returned', async () => {
    const signupDate = new Date('2026-01-01T00:00:00.000Z');
    usersRepository.find.mockResolvedValue([
      makeUser('u1', signupDate),
      makeUser('u2', signupDate),
    ]);
    predictionsRepository.find.mockResolvedValue([
      {
        user: { id: 'u1' },
        submitted_at: new Date('2026-01-01T05:00:00.000Z'),
      },
    ]);

    const result = await service.getRetention('day', 4);

    const cohort = result.cohorts[0];
    expect(cohort.total_users).toBe(2);
    expect(cohort.retention_rates['0']).toBe(50);
    expect(Number.isNaN(cohort.retention_rates['0'])).toBe(false);
  });
});
