import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { AnalyticsController } from '../src/analytics/analytics.controller';
import { AnalyticsService } from '../src/analytics/analytics.service';
import { User } from '../src/users/entities/user.entity';
import { Prediction } from '../src/predictions/entities/prediction.entity';
import { LeaderboardEntry } from '../src/leaderboard/entities/leaderboard-entry.entity';
import { Market } from '../src/markets/entities/market.entity';
import { MarketHistory } from '../src/analytics/entities/market-history.entity';
import { ActivityLog } from '../src/analytics/entities/activity-log.entity';
import { MAX_DATE_RANGE_DAYS } from '../src/common/dto/date-range-query.dto';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';

describe('Analytics market history time range (e2e)', () => {
  let app: INestApplication;
  let historyQb: {
    where: jest.Mock;
    andWhere: jest.Mock;
    orderBy: jest.Mock;
    getMany: jest.Mock;
  };

  const mockMarket = {
    id: 'market-123',
    on_chain_market_id: 'chain-123',
    title: 'Test Market',
  } as Market;

  beforeEach(async () => {
    historyQb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AnalyticsController],
      providers: [
        AnalyticsService,
        {
          provide: getRepositoryToken(User),
          useValue: { findOne: jest.fn() },
        },
        {
          provide: getRepositoryToken(Prediction),
          useValue: { find: jest.fn(), createQueryBuilder: jest.fn() },
        },
        {
          provide: getRepositoryToken(LeaderboardEntry),
          useValue: { createQueryBuilder: jest.fn() },
        },
        {
          provide: getRepositoryToken(Market),
          useValue: {
            findOne: jest.fn().mockResolvedValue(mockMarket),
          },
        },
        {
          provide: getRepositoryToken(ActivityLog),
          useValue: { createQueryBuilder: jest.fn() },
        },
        {
          provide: getRepositoryToken(MarketHistory),
          useValue: {
            createQueryBuilder: jest.fn().mockReturnValue(historyQb),
          },
        },
        {
          provide: CACHE_MANAGER,
          useValue: { get: jest.fn(), set: jest.fn(), del: jest.fn() },
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalInterceptors(new ResponseInterceptor());
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it('rejects inverted date ranges with 400', async () => {
    await request(app.getHttpServer())
      .get('/analytics/markets/market-123/history')
      .query({
        from: '2026-02-01T00:00:00.000Z',
        to: '2026-01-01T00:00:00.000Z',
      })
      .expect(400);
  });

  it('clamps oversized date ranges to the max lookback window', async () => {
    const to = '2024-06-01T00:00:00.000Z';
    const from = '2020-01-01T00:00:00.000Z';

    await request(app.getHttpServer())
      .get('/analytics/markets/market-123/history')
      .query({ from, to })
      .expect(200);

    const fromBinding = historyQb.andWhere.mock.calls.find(
      ([clause]: [string]) => clause.includes('>= :from'),
    )?.[1]?.from as Date;
    const toBinding = historyQb.andWhere.mock.calls.find(([clause]: [string]) =>
      clause.includes('<= :to'),
    )?.[1]?.to as Date;

    const windowDays =
      (toBinding.getTime() - fromBinding.getTime()) / (24 * 60 * 60 * 1000);

    expect(windowDays).toBeLessThanOrEqual(MAX_DATE_RANGE_DAYS);
    expect(windowDays).toBeCloseTo(MAX_DATE_RANGE_DAYS, 5);
  });
});
