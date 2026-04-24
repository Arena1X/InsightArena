import { Test, TestingModule } from '@nestjs/testing';
import { MarketsController } from './markets.controller';
import { MarketsService } from './markets.service';
import { AnalyticsService } from '../analytics/analytics.service';

describe('MarketsController', () => {
  let controller: MarketsController;
  const marketsService = {};
  const analyticsService = {
    getMarketAnalytics: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MarketsController],
      providers: [
        { provide: MarketsService, useValue: marketsService },
        { provide: AnalyticsService, useValue: analyticsService },
      ],
    }).compile();

    controller = module.get<MarketsController>(MarketsController);
    jest.clearAllMocks();
  });

  it('maps analytics payload to markets summary response', async () => {
    analyticsService.getMarketAnalytics.mockResolvedValue({
      market_id: 'market-1',
      total_pool_stroops: '5000000',
      participant_count: 25,
      outcome_distribution: [{ outcome: 'YES', count: 10, percentage: 40 }],
      time_remaining_seconds: 3600,
      volume_24h_stroops: '1500000',
    });

    const result = await controller.getMarketAnalytics('market-1');

    expect(analyticsService.getMarketAnalytics).toHaveBeenCalledWith(
      'market-1',
    );
    expect(result).toEqual({
      poolSize: '5000000',
      participantCount: 25,
      outcomeDistribution: [{ outcome: 'YES', count: 10, percentage: 40 }],
      timeRemaining: 3600,
      volume24h: '1500000',
    });
  });
});
