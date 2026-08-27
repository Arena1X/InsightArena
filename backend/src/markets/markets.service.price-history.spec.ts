import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { MarketsService } from './markets.service';
import { MarketPriceSnapshot } from './entities/market-price-snapshot.entity';
import { Market } from './entities/market.entity';
import {
  PriceHistoryQueryDto,
  TimeRange,
  Interval,
} from './dto/price-history-query.dto';

// Missing imports added based on user's guidance
import { Comment } from './entities/comment.entity';
import { MarketTemplate } from './entities/market-template.entity';
import { UserBookmark } from './entities/user-bookmark.entity';
import { Prediction } from '../predictions/entities/prediction.entity';
import { UsersService } from '../users/users.service';
import { SorobanService } from '../soroban/soroban.service';
import { DataSource } from 'typeorm';
import { WebhookDispatcherService } from '../webhooks/services/webhook-dispatcher.service';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { MarketSettlementScheduler } from './market-settlement.scheduler';

describe('MarketsService - getPriceHistory', () => {
  let service: MarketsService;
  let mockSnapshotRepo: any;
  let mockQueryBuilder: any;
  let mockMarketsRepo: any;

  beforeEach(async () => {
    mockQueryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      addGroupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
    };

    mockSnapshotRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
      create: jest.fn(),
      save: jest.fn(),
    };

    mockMarketsRepo = {
      findOne: jest.fn().mockResolvedValue({ id: 'market-1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MarketsService,
        {
          provide: getRepositoryToken(MarketPriceSnapshot),
          useValue: mockSnapshotRepo,
        },
        {
          provide: getRepositoryToken(Market),
          useValue: mockMarketsRepo,
        },
        { provide: getRepositoryToken(Comment), useValue: {} },
        { provide: getRepositoryToken(MarketTemplate), useValue: {} },
        { provide: getRepositoryToken(UserBookmark), useValue: {} },
        { provide: getRepositoryToken(Prediction), useValue: {} },
        { provide: UsersService, useValue: {} },
        { provide: SorobanService, useValue: {} },
        { provide: DataSource, useValue: {} },
        { provide: WebhookDispatcherService, useValue: { emit: jest.fn() } },
        { provide: CACHE_MANAGER, useValue: {} },
        { provide: MarketSettlementScheduler, useValue: {} },
      ],
    }).compile();

    service = module.get<MarketsService>(MarketsService);

    // Stub findByIdOrOnChainId so it doesn't try to query the real repo
    jest
      .spyOn(service as any, 'findByIdOrOnChainId')
      .mockResolvedValue({ id: 'market-1' } as Market);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should query all data when timeRange is ALL', async () => {
    const query: PriceHistoryQueryDto = {
      timeRange: TimeRange.ALL,
      interval: Interval.ONE_HOUR,
    };

    const result = await service.getPriceHistory('market-1', query);

    expect(mockQueryBuilder.andWhere).not.toHaveBeenCalledWith(
      expect.stringContaining('INTERVAL'),
    );
    expect(mockQueryBuilder.select).toHaveBeenCalledWith(
      "date_trunc('hour', snapshot.created_at)",
      'timestamp',
    );
    expect(result).toEqual([]);
  });

  it('should apply the correct INTERVAL for timeRange 1d and interval 1m', async () => {
    const query: PriceHistoryQueryDto = {
      timeRange: TimeRange.ONE_DAY,
      interval: Interval.ONE_MINUTE,
    };

    const mockData = [
      { timestamp: '2023-01-01T12:00:00Z', outcome_index: 0, price: '0.45' },
      { timestamp: '2023-01-01T12:00:00Z', outcome_index: 1, price: '0.55' },
    ];
    mockQueryBuilder.getRawMany.mockResolvedValue(mockData);

    const result = await service.getPriceHistory('market-1', query);

    expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
      `snapshot.created_at >= NOW() - INTERVAL '1 day'`,
    );
    expect(mockQueryBuilder.select).toHaveBeenCalledWith(
      "date_trunc('minute', snapshot.created_at)",
      'timestamp',
    );

    // Test data mapping
    expect(result).toEqual([
      { timestamp: '2023-01-01T12:00:00Z', outcome_index: 0, price: 0.45 },
      { timestamp: '2023-01-01T12:00:00Z', outcome_index: 1, price: 0.55 },
    ]);
  });
});
