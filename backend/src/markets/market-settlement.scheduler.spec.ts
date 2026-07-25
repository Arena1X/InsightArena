import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, UpdateResult } from 'typeorm';
import { MarketSettlementScheduler } from './market-settlement.scheduler';
import { Market, MarketSettlementState } from './entities/market.entity';
import { SorobanService } from '../soroban/soroban.service';
import { WebhookDispatcherService } from '../webhooks/services/webhook-dispatcher.service';

type MockRepo = jest.Mocked<Pick<Repository<Market>, 'find' | 'update'>>;

describe('MarketSettlementScheduler', () => {
  let scheduler: MarketSettlementScheduler;
  let marketsRepository: MockRepo;
  let sorobanService: jest.Mocked<Pick<SorobanService, 'resolveMarket'>>;
  let webhookDispatcher: { emit: jest.Mock };

  const currentNow = new Date('2026-06-15T12:00:00.000Z');

  const makeMarket = (overrides: Partial<Market> = {}): Market =>
    ({
      id: 'market-1',
      on_chain_market_id: 'on-chain-1',
      outcome_options: ['YES', 'NO'],
      settlement_state: MarketSettlementState.PROPOSED,
      proposed_outcome: 'YES',
      resolution_proposed_at: new Date(currentNow.getTime() - 90_000_000),
      grace_period_seconds: 86400,
      is_resolved: false,
      ...overrides,
    }) as Market;

  beforeEach(async () => {
    jest.useFakeTimers();
    jest.setSystemTime(currentNow);

    marketsRepository = {
      find: jest.fn(),
      update: jest.fn(),
    };
    sorobanService = { resolveMarket: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MarketSettlementScheduler,
        { provide: getRepositoryToken(Market), useValue: marketsRepository },
        { provide: SorobanService, useValue: sorobanService },
        { provide: WebhookDispatcherService, useValue: { emit: jest.fn() } },
      ],
    }).compile();

    scheduler = module.get<MarketSettlementScheduler>(
      MarketSettlementScheduler,
    );
    webhookDispatcher = module.get(WebhookDispatcherService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('does not settle a market whose grace period has not elapsed', async () => {
    const market = makeMarket({
      resolution_proposed_at: new Date(currentNow.getTime() - 1000), // 1s ago, grace is 86400s
    });
    marketsRepository.find.mockResolvedValue([market]);

    const settled = await scheduler.settleEligibleMarkets();

    expect(settled).toBe(0);
    expect(marketsRepository.update).not.toHaveBeenCalled();
    expect(sorobanService.resolveMarket).not.toHaveBeenCalled();
  });

  it('settles a market once its grace period has elapsed', async () => {
    const market = makeMarket();
    marketsRepository.find.mockResolvedValue([market]);
    marketsRepository.update.mockResolvedValue({ affected: 1 } as UpdateResult);

    const settled = await scheduler.settleEligibleMarkets();

    expect(settled).toBe(1);
    expect(marketsRepository.update).toHaveBeenCalledWith(
      { id: 'market-1', settlement_state: MarketSettlementState.PROPOSED },
      expect.objectContaining({
        settlement_state: MarketSettlementState.SETTLED,
        is_resolved: true,
        resolved_outcome: 'YES',
      }),
    );
    expect(sorobanService.resolveMarket).toHaveBeenCalledWith(
      'on-chain-1',
      'YES',
    );
    expect(webhookDispatcher.emit).toHaveBeenCalledWith(
      'market.settled',
      expect.objectContaining({ id: 'market-1', resolved_outcome: 'YES' }),
    );
  });

  it('skips markets that are frozen by a challenge', async () => {
    // A challenged market is never returned by the PROPOSED-state query,
    // so the repository mock simply returns nothing eligible.
    marketsRepository.find.mockResolvedValue([]);

    const settled = await scheduler.settleEligibleMarkets();

    expect(settled).toBe(0);
    expect(marketsRepository.update).not.toHaveBeenCalled();
  });

  it('settles each eligible market exactly once even when run twice back-to-back (double-run)', async () => {
    const market = makeMarket();
    marketsRepository.find.mockResolvedValue([market]);
    // First call claims the row; second call's conditional WHERE no longer
    // matches (settlement_state moved to SETTLED), so affected === 0.
    marketsRepository.update
      .mockResolvedValueOnce({ affected: 1 } as UpdateResult)
      .mockResolvedValueOnce({ affected: 0 } as UpdateResult);

    const firstRun = await scheduler.settleEligibleMarkets();
    const secondRun = await scheduler.settleEligibleMarkets();

    expect(firstRun).toBe(1);
    expect(secondRun).toBe(0);
    expect(marketsRepository.update).toHaveBeenCalledTimes(2);
    expect(sorobanService.resolveMarket).toHaveBeenCalledTimes(1);
    expect(webhookDispatcher.emit).toHaveBeenCalledTimes(1);
  });

  it('continues logging without throwing when Soroban settlement fails', async () => {
    const market = makeMarket();
    marketsRepository.find.mockResolvedValue([market]);
    marketsRepository.update.mockResolvedValue({ affected: 1 } as UpdateResult);
    sorobanService.resolveMarket.mockRejectedValue(new Error('RPC down'));

    const settled = await scheduler.settleEligibleMarkets();

    expect(settled).toBe(1);
    expect(webhookDispatcher.emit).toHaveBeenCalledWith(
      'market.settled',
      expect.any(Object),
    );
  });

  it('handleSettlement swallows sweep-level errors without throwing', async () => {
    marketsRepository.find.mockRejectedValue(new Error('DB unavailable'));

    await expect(scheduler.handleSettlement()).resolves.not.toThrow();
  });
});
