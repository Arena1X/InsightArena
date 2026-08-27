import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { MarketSettlementScheduler } from './market-settlement.scheduler';
import { Market, MarketSettlementState } from './entities/market.entity';
import {
  SettlementAttempt,
  SettlementAttemptStatus,
} from './entities/settlement-attempt.entity';
import { SorobanService } from '../soroban/soroban.service';
import { WebhookDispatcherService } from '../webhooks/services/webhook-dispatcher.service';

type MockMarketRepo = jest.Mocked<Pick<Repository<Market>, 'find' | 'findOne'>>;
type MockAttemptRepo = jest.Mocked<
  Pick<Repository<SettlementAttempt>, 'findOne' | 'update'>
>;

describe('MarketSettlementScheduler', () => {
  let scheduler: MarketSettlementScheduler;
  let marketsRepository: MockMarketRepo;
  let settlementAttemptRepository: MockAttemptRepo;
  let sorobanService: jest.Mocked<Pick<SorobanService, 'resolveMarket'>>;
  let webhookDispatcher: { emit: jest.Mock };
  let dataSource: jest.Mocked<DataSource>;

  const currentNow = new Date('2026-06-15T12:00:00.000Z');

  // Queue of advisory-lock results consumed in call order across every
  // queryRunner created during a test — lets a test simulate "another
  // instance already holds the lock" for a specific claim attempt.
  let lockResultsQueue: boolean[];

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

  const makeQueryRunner = () => {
    const manager = {
      findOne: jest.fn(),
      create: jest.fn((_entity, plain) => plain),
      save: jest.fn((entity) =>
        Promise.resolve({ id: 'attempt-1', ...entity }),
      ),
      update: jest.fn().mockResolvedValue(undefined),
    };
    return {
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
      query: jest
        .fn()
        .mockImplementation(() =>
          Promise.resolve([{ locked: lockResultsQueue.shift() ?? true }]),
        ),
      manager,
    };
  };

  beforeEach(async () => {
    jest.useFakeTimers();
    jest.setSystemTime(currentNow);
    lockResultsQueue = [];

    marketsRepository = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
    };
    settlementAttemptRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue(undefined),
    };
    sorobanService = { resolveMarket: jest.fn().mockResolvedValue(undefined) };
    dataSource = {
      createQueryRunner: jest.fn(() => makeQueryRunner()),
    } as unknown as jest.Mocked<DataSource>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MarketSettlementScheduler,
        { provide: getRepositoryToken(Market), useValue: marketsRepository },
        {
          provide: getRepositoryToken(SettlementAttempt),
          useValue: settlementAttemptRepository,
        },
        { provide: DataSource, useValue: dataSource },
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

  const mockProposedCandidates = (markets: Market[]) => {
    marketsRepository.find.mockImplementation(
      ({ where }: { where: { settlement_state: MarketSettlementState } }) => {
        if (where.settlement_state === MarketSettlementState.PROPOSED) {
          return Promise.resolve(markets);
        }
        return Promise.resolve([]);
      },
    );
  };

  it('does not settle a market whose grace period has not elapsed', async () => {
    const market = makeMarket({
      resolution_proposed_at: new Date(currentNow.getTime() - 1000), // 1s ago, grace is 86400s
    });
    mockProposedCandidates([market]);

    const settled = await scheduler.settleEligibleMarkets();

    expect(settled).toBe(0);
    expect(dataSource.createQueryRunner).not.toHaveBeenCalled();
    expect(sorobanService.resolveMarket).not.toHaveBeenCalled();
  });

  it('settles a market once its grace period has elapsed', async () => {
    const market = makeMarket();
    mockProposedCandidates([market]);
    lockResultsQueue = [true, true]; // claim, then finalize

    const queryRunners: ReturnType<typeof makeQueryRunner>[] = [];
    dataSource.createQueryRunner = jest.fn(() => {
      const qr = makeQueryRunner();
      qr.manager.findOne.mockResolvedValue(market);
      queryRunners.push(qr);
      return qr;
    }) as unknown as jest.Mocked<DataSource>['createQueryRunner'];

    const settled = await scheduler.settleEligibleMarkets();

    expect(settled).toBe(1);
    expect(sorobanService.resolveMarket).toHaveBeenCalledWith(
      'on-chain-1',
      'YES',
    );
    // Claim transaction: attempt logged RESOLVING, market moved to SETTLING.
    expect(queryRunners[0].manager.update).toHaveBeenCalledWith(
      Market,
      { id: 'market-1' },
      { settlement_state: MarketSettlementState.SETTLING },
    );
    // Finalize transaction: market SETTLED, attempt RESOLVED.
    expect(queryRunners[1].manager.update).toHaveBeenCalledWith(
      Market,
      { id: 'market-1' },
      expect.objectContaining({
        settlement_state: MarketSettlementState.SETTLED,
        is_resolved: true,
        resolved_outcome: 'YES',
      }),
    );
    expect(queryRunners[1].manager.update).toHaveBeenCalledWith(
      SettlementAttempt,
      { id: 'attempt-1' },
      expect.objectContaining({ status: SettlementAttemptStatus.RESOLVED }),
    );
    expect(webhookDispatcher.emit).toHaveBeenCalledWith(
      'market.settled',
      expect.objectContaining({ id: 'market-1', resolved_outcome: 'YES' }),
    );
  });

  it('skips markets that are frozen by a challenge', async () => {
    // A challenged market is never returned by the PROPOSED-state query,
    // so the repository mock simply returns nothing eligible.
    mockProposedCandidates([]);

    const settled = await scheduler.settleEligibleMarkets();

    expect(settled).toBe(0);
    expect(dataSource.createQueryRunner).not.toHaveBeenCalled();
  });

  it('settles each eligible market exactly once under concurrent schedulers (advisory lock)', async () => {
    const market = makeMarket();
    mockProposedCandidates([market]);

    const queryRunners: ReturnType<typeof makeQueryRunner>[] = [];
    dataSource.createQueryRunner = jest.fn(() => {
      const qr = makeQueryRunner();
      qr.manager.findOne.mockResolvedValue(market);
      queryRunners.push(qr);
      return qr;
    }) as unknown as jest.Mocked<DataSource>['createQueryRunner'];

    // First "instance" claims the lock; a second, overlapping tick's claim
    // attempt fails to acquire it. Finalize (third queryRunner) succeeds.
    lockResultsQueue = [true, false, true];

    const [firstRun, secondRun] = await Promise.all([
      scheduler.settleEligibleMarkets(),
      scheduler.settleEligibleMarkets(),
    ]);

    expect(firstRun + secondRun).toBe(1);
    expect(sorobanService.resolveMarket).toHaveBeenCalledTimes(1);
    expect(webhookDispatcher.emit).toHaveBeenCalledTimes(1);
    // The losing claim rolled back rather than committing any market write.
    const rolledBack = queryRunners.filter(
      (qr) => qr.rollbackTransaction.mock.calls.length > 0,
    );
    expect(rolledBack.length).toBeGreaterThan(0);
  });

  it('does not re-settle a market another instance already resolved', async () => {
    const market = makeMarket();
    mockProposedCandidates([market]);
    lockResultsQueue = [true];

    dataSource.createQueryRunner = jest.fn(() => {
      const qr = makeQueryRunner();
      // Lock is granted, but by the time we re-read the row it's already
      // SETTLED — another instance finished first.
      qr.manager.findOne.mockResolvedValue({
        ...market,
        settlement_state: MarketSettlementState.SETTLED,
      });
      return qr;
    }) as unknown as jest.Mocked<DataSource>['createQueryRunner'];

    const settled = await scheduler.settleEligibleMarkets();

    expect(settled).toBe(0);
    expect(sorobanService.resolveMarket).not.toHaveBeenCalled();
  });

  it('resumes a market abandoned mid-settlement by a crashed instance', async () => {
    const settlingMarket = makeMarket({
      settlement_state: MarketSettlementState.SETTLING,
    });
    marketsRepository.find.mockImplementation(
      ({ where }: { where: { settlement_state: MarketSettlementState } }) => {
        if (where.settlement_state === MarketSettlementState.SETTLING) {
          return Promise.resolve([settlingMarket]);
        }
        return Promise.resolve([]);
      },
    );
    settlementAttemptRepository.findOne.mockResolvedValue({
      id: 'stale-attempt',
      market_id: 'market-1',
      status: SettlementAttemptStatus.RESOLVING,
      created_at: new Date(currentNow.getTime() - 10 * 60 * 1000), // 10 min ago
    } as SettlementAttempt);

    lockResultsQueue = [true, true];
    dataSource.createQueryRunner = jest.fn(() => {
      const qr = makeQueryRunner();
      qr.manager.findOne.mockResolvedValue(settlingMarket);
      return qr;
    }) as unknown as jest.Mocked<DataSource>['createQueryRunner'];

    const settled = await scheduler.settleEligibleMarkets();

    expect(settled).toBe(1);
    expect(sorobanService.resolveMarket).toHaveBeenCalledWith(
      'on-chain-1',
      'YES',
    );
  });

  it('does not resume a SETTLING market whose attempt is still fresh (in flight elsewhere)', async () => {
    const settlingMarket = makeMarket({
      settlement_state: MarketSettlementState.SETTLING,
    });
    marketsRepository.find.mockImplementation(
      ({ where }: { where: { settlement_state: MarketSettlementState } }) => {
        if (where.settlement_state === MarketSettlementState.SETTLING) {
          return Promise.resolve([settlingMarket]);
        }
        return Promise.resolve([]);
      },
    );
    settlementAttemptRepository.findOne.mockResolvedValue({
      id: 'fresh-attempt',
      market_id: 'market-1',
      status: SettlementAttemptStatus.RESOLVING,
      created_at: new Date(currentNow.getTime() - 30 * 1000), // 30s ago
    } as SettlementAttempt);

    const settled = await scheduler.settleEligibleMarkets();

    expect(settled).toBe(0);
    expect(dataSource.createQueryRunner).not.toHaveBeenCalled();
    expect(sorobanService.resolveMarket).not.toHaveBeenCalled();
  });

  it('skip-and-logs a market whose on-chain resolution fails, without blocking the batch', async () => {
    const failingMarket = makeMarket({
      id: 'market-1',
      on_chain_market_id: 'on-chain-1',
    });
    const healthyMarket = makeMarket({
      id: 'market-2',
      on_chain_market_id: 'on-chain-2',
    });
    mockProposedCandidates([failingMarket, healthyMarket]);
    lockResultsQueue = [true, true, true]; // failing claim, healthy claim, healthy finalize

    dataSource.createQueryRunner = jest.fn(() => {
      const qr = makeQueryRunner();
      qr.manager.findOne.mockImplementation(
        (_entity: unknown, options: { where: { id: string } }) =>
          Promise.resolve(
            options.where.id === 'market-1' ? failingMarket : healthyMarket,
          ),
      );
      return qr;
    }) as unknown as jest.Mocked<DataSource>['createQueryRunner'];

    sorobanService.resolveMarket.mockImplementation((onChainId: string) => {
      if (onChainId === 'on-chain-1') {
        return Promise.reject(new Error('RPC down'));
      }
      return Promise.resolve();
    });

    const settled = await scheduler.settleEligibleMarkets();

    expect(settled).toBe(1); // only the healthy market
    expect(settlementAttemptRepository.update).toHaveBeenCalledWith(
      'attempt-1',
      expect.objectContaining({ status: SettlementAttemptStatus.FAILED }),
    );
    expect(webhookDispatcher.emit).toHaveBeenCalledTimes(1);
    expect(webhookDispatcher.emit).toHaveBeenCalledWith(
      'market.settled',
      expect.objectContaining({ id: 'market-2' }),
    );
    expect(scheduler.getDeadLetterQueue()).toHaveLength(1);
  });

  it('handleSettlement swallows sweep-level errors without throwing', async () => {
    marketsRepository.find.mockRejectedValue(new Error('DB unavailable'));

    await expect(scheduler.handleSettlement()).resolves.not.toThrow();
  });
});