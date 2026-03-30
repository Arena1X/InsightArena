import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AnalyticsService } from './analytics.service';
import { Market } from '../markets/entities/market.entity';
import { MarketHistory } from './entities/market-history.entity';
import { User } from '../users/entities/user.entity';
import { Prediction } from '../predictions/entities/prediction.entity';
import { LeaderboardEntry } from '../leaderboard/entities/leaderboard-entry.entity';
import { ActivityLog } from './entities/activity-log.entity';

describe('AnalyticsService - Market History', () => {
  let service: AnalyticsService;
  let marketHistoryRepository: jest.Mocked<Repository<MarketHistory>>;
  let marketsRepository: jest.Mocked<Repository<Market>>;
  let predictionsRepository: jest.Mocked<Repository<Prediction>>;

  const mockMarket = {
    id: 'market-1',
    on_chain_market_id: 'market_123',
    title: 'Test Market',
    outcome_options: ['YES', 'NO'],
    participant_count: 10,
    total_pool_stroops: '5000000',
    created_at: new Date(),
  } as Market;

  beforeEach(async () => {
    marketHistoryRepository = {
      find: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    } as any;

    marketsRepository = {
      findOne: jest.fn().mockResolvedValue(mockMarket),
    } as any;

    predictionsRepository = {
      find: jest.fn().mockResolvedValue([]),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        {
          provide: getRepositoryToken(User),
          useValue: {},
        },
        {
          provide: getRepositoryToken(Prediction),
          useValue: predictionsRepository,
        },
        {
          provide: getRepositoryToken(LeaderboardEntry),
          useValue: {},
        },
        {
          provide: getRepositoryToken(Market),
          useValue: marketsRepository,
        },
        {
          provide: getRepositoryToken(ActivityLog),
          useValue: {},
        },
        {
          provide: getRepositoryToken(MarketHistory),
          useValue: marketHistoryRepository,
        },
      ],
    }).compile();

    service = module.get<AnalyticsService>(AnalyticsService);
  });

  it('should get market history', async () => {
    const mockHistory = [
      {
        recorded_at: new Date(),
        prediction_volume: 5,
        pool_size_stroops: '2500000',
        participant_count: 5,
        outcome_probabilities: ['50.00', '50.00'],
      },
      {
        recorded_at: new Date(Date.now() + 1000),
        prediction_volume: 10,
        pool_size_stroops: '5000000',
        participant_count: 10,
        outcome_probabilities: ['60.00', '40.00'],
      },
    ] as MarketHistory[];

    marketHistoryRepository.find.mockResolvedValue(mockHistory);

    const result = await service.getMarketHistory('market-1');

    expect(result.market_id).toBe('market-1');
    expect(result.title).toBe('Test Market');
    expect(result.history).toHaveLength(2);
    expect(result.history[0].prediction_volume).toBe(5);
  });

  it('should record market snapshot', async () => {
    marketHistoryRepository.create.mockReturnValue({
      market: mockMarket,
      recorded_at: new Date(),
      prediction_volume: 10,
      pool_size_stroops: '5000000',
      participant_count: 10,
      outcome_probabilities: ['50.00', '50.00'],
    } as MarketHistory);

    marketHistoryRepository.save.mockResolvedValue({} as MarketHistory);

    await service.recordMarketSnapshot(mockMarket);

    expect(marketHistoryRepository.create).toHaveBeenCalled();
    expect(marketHistoryRepository.save).toHaveBeenCalled();
  });

  it('should throw NotFoundException for non-existent market', async () => {
    marketsRepository.findOne.mockResolvedValue(null);

    await expect(service.getMarketHistory('invalid-id')).rejects.toThrow();
  });
});
