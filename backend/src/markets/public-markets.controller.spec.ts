import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ApiKeyService } from '../auth/api-key.service';
import { Market, MarketSettlementState } from './entities/market.entity';
import { PublicMarketsController } from './public-markets.controller';
import { MarketsService } from './markets.service';

describe('PublicMarketsController', () => {
  let controller: PublicMarketsController;

  const market = {
    id: '27c91229-34ac-44fd-b343-a96db4108bb3',
    on_chain_market_id: '42',
    title: 'Will it rain?',
    description: 'A public market',
    category: 'weather',
    outcome_options: ['yes', 'no'],
    end_time: new Date('2027-01-01T00:00:00.000Z'),
    resolution_time: new Date('2027-01-02T00:00:00.000Z'),
    is_resolved: false,
    resolved_outcome: null,
    resolved_at: null,
    settlement_state: MarketSettlementState.PENDING,
    is_public: true,
    is_cancelled: false,
    is_featured: false,
    is_paused: false,
    proposed_outcome: null,
    resolution_proposed_at: null,
    grace_period_seconds: 86400,
    total_pool_stroops: '1000',
    participant_count: 2,
    featured_at: null,
    created_at: new Date('2026-01-01T00:00:00.000Z'),
    creator: {
      id: 'ccb37778-e246-45fd-b6f9-f3376e2e7d71',
      username: 'creator',
      avatar_url: null,
      email: 'private@example.com',
      stellar_address: 'GPRIVATE',
      role: 'admin',
      is_banned: false,
    },
  } as Market;

  const marketsService = {
    findAllFiltered: jest.fn(),
    findByIdOrOnChainId: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [PublicMarketsController],
      providers: [
        { provide: MarketsService, useValue: marketsService },
        { provide: ApiKeyService, useValue: {} },
      ],
    }).compile();
    controller = moduleRef.get(PublicMarketsController);
  });

  it('forces the public filter and excludes sensitive fields from list results', async () => {
    marketsService.findAllFiltered.mockResolvedValue({
      data: [market],
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    });

    const result = await controller.list({ is_public: false });

    expect(marketsService.findAllFiltered).toHaveBeenCalledWith({
      is_public: true,
    });
    expect(result.data[0].creator).toEqual({
      id: market.creator.id,
      username: market.creator.username,
      avatar_url: market.creator.avatar_url,
    });
    expect(result.data[0]).not.toHaveProperty('proposed_outcome');
    expect(result.data[0]).not.toHaveProperty('is_paused');
    expect(result.data[0].creator).not.toHaveProperty('email');
    expect(result.data[0].creator).not.toHaveProperty('stellar_address');
    expect(result.data[0].creator).not.toHaveProperty('role');
  });

  it('does not expose a non-public market by id', async () => {
    marketsService.findByIdOrOnChainId.mockResolvedValue({
      ...market,
      is_public: false,
    });

    await expect(controller.get(market.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
