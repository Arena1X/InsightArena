import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { LeaderboardEntry } from '../leaderboard/entities/leaderboard-entry.entity';
import { Market } from '../markets/entities/market.entity';
import { Prediction } from '../predictions/entities/prediction.entity';
import { User } from '../users/entities/user.entity';
import { ActivityLog } from './entities/activity-log.entity';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';

describe('AnalyticsController', () => {
  let controller: AnalyticsController;
  let service: AnalyticsService;
  let mockMarketsRepository: any;
  let mockPredictionsRepository: any;

  const mockMarket: Market = {
    id: 'market-123',
    on_chain_market_id: 'on-chain-123',
    title: 'Test Market',
    description: 'Test Description',
    category: 'sports',
    outcome_options: ['Yes', 'No', 'Maybe'],
    end_time: new Date(Date.now() + 3600000), // 1 hour from now
    resolution_time: new Date(Date.now() + 7200000),
    is_resolved: false,
    resolved_outcome: null,
    is_public: true,
    is_cancelled: false,
    total_pool_stroops: '5000000',
    participant_count: 25,
    creator: {} as User,
    created_at: new Date(),
    updated_at: new Date(),
  } as Market;

  const mockPredictions: Prediction[] = [
    {
      id: 'pred-1',
      user: {} as User,
      market: mockMarket,
      chosen_outcome: 'Yes',
      stake_amount_stroops: '1000000',
      payout_claimed: false,
      payout_amount_stroops: '0',
      tx_hash: 'hash1',
      submitted_at: new Date(),
    },
    {
      id: 'pred-2',
      user: {} as User,
      market: mockMarket,
      chosen_outcome: 'Yes',
      stake_amount_stroops: '500000',
      payout_claimed: false,
      payout_amount_stroops: '0',
      tx_hash: 'hash2',
      submitted_at: new Date(),
    },
    {
      id: 'pred-3',
      user: {} as User,
      market: mockMarket,
      chosen_outcome: 'No',
      stake_amount_stroops: '2000000',
      payout_claimed: false,
      payout_amount_stroops: '0',
      tx_hash: 'hash3',
      submitted_at: new Date(),
    },
    {
      id: 'pred-4',
      user: {} as User,
      market: mockMarket,
      chosen_outcome: 'Maybe',
      stake_amount_stroops: '1500000',
      payout_claimed: false,
      payout_amount_stroops: '0',
      tx_hash: 'hash4',
      submitted_at: new Date(),
    },
  ];

  beforeEach(async () => {
    mockMarketsRepository = {
      findOne: jest.fn(),
    };

    mockPredictionsRepository = {
      find: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AnalyticsController],
      providers: [
        AnalyticsService,
        {
          provide: getRepositoryToken(Market),
          useValue: mockMarketsRepository,
        },
        {
          provide: getRepositoryToken(Prediction),
          useValue: mockPredictionsRepository,
        },
        {
          provide: getRepositoryToken(User),
          useValue: { findOne: jest.fn() },
        },
        {
          provide: getRepositoryToken(LeaderboardEntry),
          useValue: {
            createQueryBuilder: jest.fn().mockReturnValue({
              where: jest.fn().mockReturnThis(),
              andWhere: jest.fn().mockReturnThis(),
              orderBy: jest.fn().mockReturnThis(),
              getOne: jest.fn(),
            }),
          },
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

    controller = module.get<AnalyticsController>(AnalyticsController);
    service = module.get<AnalyticsService>(AnalyticsService);
  });

  describe('getMarketAnalytics', () => {
    it('should return market analytics with outcome distribution', async () => {
      mockMarketsRepository.findOne.mockResolvedValue(mockMarket);
      mockPredictionsRepository.find.mockResolvedValue(mockPredictions);

      const result = await controller.getMarketAnalytics('market-123');

      expect(result).toBeDefined();
      expect(result.market_id).toBe('market-123');
      expect(result.total_pool_stroops).toBe('5000000');
      expect(result.participant_count).toBe(25);
      expect(result.outcome_distribution).toHaveLength(3);
    });

    it('should calculate percentages that sum to 100%', async () => {
      mockMarketsRepository.findOne.mockResolvedValue(mockMarket);
      mockPredictionsRepository.find.mockResolvedValue(mockPredictions);

      const result = await controller.getMarketAnalytics('market-123');

      const totalPercentage = result.outcome_distribution.reduce(
        (sum, outcome) => sum + outcome.percentage,
        0,
      );
      expect(totalPercentage).toBe(100);
    });

    it('should calculate correct counts per outcome', async () => {
      mockMarketsRepository.findOne.mockResolvedValue(mockMarket);
      mockPredictionsRepository.find.mockResolvedValue(mockPredictions);

      const result = await controller.getMarketAnalytics('market-123');

      const yesOutcome = result.outcome_distribution.find(
        (o) => o.outcome === 'Yes',
      );
      const noOutcome = result.outcome_distribution.find(
        (o) => o.outcome === 'No',
      );
      const maybeOutcome = result.outcome_distribution.find(
        (o) => o.outcome === 'Maybe',
      );

      expect(yesOutcome!.count).toBe(2);
      expect(noOutcome!.count).toBe(1);
      expect(maybeOutcome!.count).toBe(1);
    });

    it('should calculate positive time_remaining_seconds when market is open', async () => {
      mockMarketsRepository.findOne.mockResolvedValue(mockMarket);
      mockPredictionsRepository.find.mockResolvedValue(mockPredictions);

      const result = await controller.getMarketAnalytics('market-123');

      expect(result.time_remaining_seconds).toBeGreaterThan(0);
    });

    it('should return 0 time_remaining_seconds when market has expired', async () => {
      const expiredMarket = {
        ...mockMarket,
        end_time: new Date(Date.now() - 3600000), // 1 hour ago
      };

      mockMarketsRepository.findOne.mockResolvedValue(expiredMarket);
      mockPredictionsRepository.find.mockResolvedValue(mockPredictions);

      const result = await controller.getMarketAnalytics('market-123');

      expect(result.time_remaining_seconds).toBe(0);
    });

    it('should return 404 when market does not exist', async () => {
      mockMarketsRepository.findOne.mockResolvedValue(null);

      await expect(
        controller.getMarketAnalytics('non-existent-id'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should handle market lookup by on-chain ID', async () => {
      mockMarketsRepository.findOne.mockResolvedValue(mockMarket);
      mockPredictionsRepository.find.mockResolvedValue(mockPredictions);

      const result = await controller.getMarketAnalytics('on-chain-123');

      expect(result.market_id).toBe('market-123');
    });

    it('should initialize all outcomes with 0 if no predictions exist', async () => {
      mockMarketsRepository.findOne.mockResolvedValue(mockMarket);
      mockPredictionsRepository.find.mockResolvedValue([]);

      const result = await controller.getMarketAnalytics('market-123');

      expect(result.outcome_distribution).toHaveLength(3);
      result.outcome_distribution.forEach((outcome) => {
        expect(outcome.count).toBe(0);
        expect(outcome.percentage).toBe(0);
      });
    });
  });
});
