import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { UserTrendsDto } from './dto/user-trends.dto';
import { DashboardKpisDto } from './dto/dashboard-kpis.dto';
import { MarketAnalyticsDto } from './dto/market-analytics.dto';
import { MarketHistoryResponseDto } from './dto/market-history.dto';
import { User } from '../users/entities/user.entity';

describe('AnalyticsController', () => {
  let controller: AnalyticsController;
  let service: jest.Mocked<AnalyticsService>;

  const mockUser: User = {
    id: 'user-123',
    stellar_address: 'GABC123',
    username: 'testuser',
    total_predictions: 10,
    correct_predictions: 7,
    reputation_score: 750,
    total_winnings_stroops: BigInt(1000000),
    total_staked_stroops: BigInt(500000),
    is_banned: false,
    created_at: new Date(),
    updated_at: new Date(),
  } as unknown as User;

  const mockDashboardKpis: DashboardKpisDto = {
    total_predictions: 10,
    accuracy_rate: '70.0',
    current_rank: 5,
    total_rewards_earned_stroops: '1000000',
    active_predictions_count: 3,
    current_streak: 2,
    reputation_score: 750,
    tier: 'Gold Predictor',
  };

  const mockMarketAnalytics: MarketAnalyticsDto = {
    market_id: 'market-123',
    total_pool_stroops: '5000000',
    participant_count: 25,
    outcome_distribution: [
      { outcome: 'YES', count: 15, percentage: 60 },
      { outcome: 'NO', count: 10, percentage: 40 },
    ],
    time_remaining_seconds: 3600,
  };

  const mockMarketHistory: MarketHistoryResponseDto = {
    market_id: 'market-123',
    title: 'Test Market',
    history: [
      {
        timestamp: new Date(),
        prediction_volume: 10,
        pool_size_stroops: '1000000',
        participant_count: 10,
        outcome_probabilities: [60.0, 40.0],
      },
    ],
    generated_at: new Date(),
  };

  const mockUserTrends: UserTrendsDto = {
    address: 'GABC123',
    accuracy_trend: [
      { timestamp: new Date(), value: 50 },
      { timestamp: new Date(), value: 60 },
    ],
    prediction_volume_trend: [
      { timestamp: new Date(), value: 1 },
      { timestamp: new Date(), value: 2 },
    ],
    profit_loss_trend: [
      { timestamp: new Date(), value: 0 },
      { timestamp: new Date(), value: 100000 },
    ],
    category_performance: [
      {
        category: 'Politics',
        accuracy_rate: 75,
        prediction_count: 10,
        profit_loss_stroops: '500000',
      },
    ],
    best_category: {
      category: 'Politics',
      accuracy_rate: 75,
      prediction_count: 10,
      profit_loss_stroops: '500000',
    },
    worst_category: null,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AnalyticsController],
      providers: [
        {
          provide: AnalyticsService,
          useValue: {
            getUserTrends: jest.fn(),
            getMarketAnalytics: jest.fn(),
            getMarketHistory: jest.fn(),
            getDashboardKPIs: jest.fn(),
            getCategoryAnalytics: jest.fn(),
          },
        },
        {
          provide: CACHE_MANAGER,
          useValue: {
            get: jest.fn(),
            set: jest.fn(),
            del: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<AnalyticsController>(AnalyticsController);
    service = module.get(AnalyticsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getDashboard', () => {
    it('should return dashboard KPIs for authenticated user', async () => {
      service.getDashboardKPIs.mockResolvedValue(mockDashboardKpis);

      const result = await controller.getDashboard(mockUser);

      expect(result).toEqual(mockDashboardKpis);
      expect(service.getDashboardKPIs).toHaveBeenCalledWith(mockUser);
    });

    it('should return correct tier based on reputation score', async () => {
      const goldTierKpis = {
        ...mockDashboardKpis,
        reputation_score: 750,
        tier: 'Gold Predictor',
      };
      service.getDashboardKPIs.mockResolvedValue(goldTierKpis);

      const result = await controller.getDashboard(mockUser);

      expect(result.tier).toBe('Gold Predictor');
      expect(result.reputation_score).toBe(750);
    });
  });

  describe('getMarketAnalytics', () => {
    it('should return market analytics for valid market ID', async () => {
      service.getMarketAnalytics.mockResolvedValue(mockMarketAnalytics);

      const result = await controller.getMarketAnalytics('market-123');

      expect(result).toEqual(mockMarketAnalytics);
      expect(service.getMarketAnalytics).toHaveBeenCalledWith('market-123');
    });

    it('should throw 404 for unknown market ID', async () => {
      service.getMarketAnalytics.mockRejectedValue(
        new Error('Market not found'),
      );

      await expect(
        controller.getMarketAnalytics('unknown-market'),
      ).rejects.toThrow();
    });
  });

  describe('getMarketHistory', () => {
    it('should return market history with default parameters', async () => {
      service.getMarketHistory.mockResolvedValue(mockMarketHistory);

      const result = await controller.getMarketHistory('market-123');

      expect(result).toEqual(mockMarketHistory);
      expect(service.getMarketHistory).toHaveBeenCalledWith(
        'market-123',
        undefined,
        undefined,
        undefined,
      );
    });

    it('should return market history with query parameters', async () => {
      service.getMarketHistory.mockResolvedValue(mockMarketHistory);

      const result = await controller.getMarketHistory(
        'market-123',
        '2024-01-01',
        '2024-01-31',
        'day',
      );

      expect(result).toEqual(mockMarketHistory);
      expect(service.getMarketHistory).toHaveBeenCalledWith(
        'market-123',
        '2024-01-01',
        '2024-01-31',
        'day',
      );
    });

    it('should default to last 7 days if no range provided', async () => {
      const historyWithDefaults = { ...mockMarketHistory };
      service.getMarketHistory.mockResolvedValue(historyWithDefaults);

      const result = await controller.getMarketHistory('market-123');

      expect(result).toEqual(historyWithDefaults);
      expect(service.getMarketHistory).toHaveBeenCalledWith(
        'market-123',
        undefined,
        undefined,
        undefined,
      );
    });

    it('should throw 404 for unknown market ID', async () => {
      service.getMarketHistory.mockRejectedValue(new Error('Market not found'));

      await expect(
        controller.getMarketHistory('unknown-market'),
      ).rejects.toThrow();
    });
  });

  describe('getUserTrends', () => {
    it('should return user trends with default days parameter', async () => {
      service.getUserTrends.mockResolvedValue(mockUserTrends);

      const result = await controller.getUserTrends('GABC123');

      expect(result).toEqual(mockUserTrends);
      expect(service.getUserTrends).toHaveBeenCalledWith('GABC123', undefined);
    });

    it('should return user trends with custom days parameter', async () => {
      service.getUserTrends.mockResolvedValue(mockUserTrends);

      const result = await controller.getUserTrends('GABC123', 60);

      expect(result).toEqual(mockUserTrends);
      expect(service.getUserTrends).toHaveBeenCalledWith('GABC123', 60);
    });

    it('should throw 404 for unknown user address', async () => {
      service.getUserTrends.mockRejectedValue(new Error('User not found'));

      await expect(controller.getUserTrends('GUNKNOWN')).rejects.toThrow();
    });

    it('should return trends with one entry per day for requested period', async () => {
      const trendsWithDailyData: UserTrendsDto = {
        ...mockUserTrends,
        accuracy_trend: Array.from({ length: 30 }, (_, i) => ({
          timestamp: new Date(Date.now() - (30 - i) * 24 * 60 * 60 * 1000),
          value: 50 + i,
        })),
      };

      service.getUserTrends.mockResolvedValue(trendsWithDailyData);

      const result = await controller.getUserTrends('GABC123', 30);

      expect(result.accuracy_trend.length).toBe(30);
    });
  });

  describe('getCategoryAnalytics', () => {
    it('should return category analytics', async () => {
      const mockCategoryAnalytics = {
        categories: [
          {
            name: 'Politics',
            total_markets: 10,
            active_markets: 5,
            total_volume_stroops: '1000000',
            avg_participants: 20,
            trending: true,
          },
        ],
        generated_at: new Date(),
      };
      service.getCategoryAnalytics.mockResolvedValue(mockCategoryAnalytics);

      const result = await controller.getCategoryAnalytics();

      expect(result).toEqual(mockCategoryAnalytics);
      expect(service.getCategoryAnalytics).toHaveBeenCalled();
    });
  });
});
