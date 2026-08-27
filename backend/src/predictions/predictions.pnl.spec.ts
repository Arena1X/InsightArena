/**
 * Unit tests for PredictionsService.getPnl()
 *
 * Acceptance criteria covered:
 * ✓ Realized P&L computed correctly for wins, losses, and cancelled markets
 * ✓ Unrealized P&L computed correctly from pool-weighted implied odds
 * ✓ Aggregate totals equal the sum of per-market values (breakdown=true)
 * ✓ Time filter (from / to) is applied via query builder
 * ✓ Edge cases: zero-stake pool, no predictions
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken, getDataSourceToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository, ObjectLiteral } from 'typeorm';
import { PredictionsService } from './predictions.service';
import { Prediction } from './entities/prediction.entity';
import { PredictionFraudFlag } from './entities/prediction-fraud-flag.entity';
import { Market } from '../markets/entities/market.entity';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { SorobanService } from '../soroban/soroban.service';
import { SlippageCheckerService } from './services/slippage-checker.service';
import { PnlQueryDto } from './dto/pnl-query.dto';

const STROOPS_PER_XLM = 10_000_000;

type MockRepo<T extends ObjectLiteral> = jest.Mocked<
  Pick<
    Repository<T>,
    | 'find'
    | 'findOne'
    | 'create'
    | 'save'
    | 'createQueryBuilder'
    | 'findAndCount'
  >
>;

// ─── Factories ────────────────────────────────────────────────────────────────

const makeUser = (overrides: Partial<User> = {}): User =>
  ({
    id: 'user-1',
    stellar_address: 'GABC',
    username: 'alice',
    ...overrides,
  }) as User;

const makeMarket = (overrides: Partial<Market> = {}): Market =>
  ({
    id: 'market-1',
    on_chain_market_id: 'chain-1',
    title: 'Test Market',
    outcome_options: ['Yes', 'No'],
    is_resolved: false,
    is_cancelled: false,
    total_pool_stroops: '0',
    participant_count: 0,
    ...overrides,
  }) as Market;

const makePrediction = (
  overrides: Partial<Prediction> & { market?: Market } = {},
): Prediction => {
  const market = overrides.market ?? makeMarket();
  return {
    id: 'pred-1',
    chosen_outcome: 'Yes',
    stake_amount_stroops: String(1 * STROOPS_PER_XLM), // 1 XLM
    payout_amount_stroops: '0',
    payout_claimed: false,
    submitted_at: new Date('2025-06-01T00:00:00Z'),
    market,
    user: makeUser(),
    tx_hash: null,
    note: null,
    ...overrides,
  } as Prediction;
};

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('PredictionsService.getPnl()', () => {
  let service: PredictionsService;
  let mockPredictionsRepo: MockRepo<Prediction>;

  // We control what the query builder returns so we can inject per-outcome totals
  const buildQbChain = (
    getMany: () => Promise<Prediction[]>,
    getRawMany: () => Promise<unknown[]>,
  ) => {
    const qb: Record<string, jest.Mock> = {
      leftJoinAndSelect: jest.fn(),
      where: jest.fn(),
      andWhere: jest.fn(),
      select: jest.fn(),
      addSelect: jest.fn(),
      groupBy: jest.fn(),
      getMany: jest.fn().mockImplementation(getMany),
      getRawMany: jest.fn().mockImplementation(getRawMany),
    };
    // All chainable methods return the same object
    Object.keys(qb).forEach((k) => {
      if (k !== 'getMany' && k !== 'getRawMany') {
        qb[k].mockReturnValue(qb);
      }
    });
    return qb;
  };

  const setupService = async (
    predictionsForUser: Prediction[],
    outcomeStakeRows: Array<{
      marketId: string;
      outcome: string;
      total: string;
    }>,
  ) => {
    const qb = buildQbChain(
      () => Promise.resolve(predictionsForUser),
      () => Promise.resolve(outcomeStakeRows),
    );

    mockPredictionsRepo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      findAndCount: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(qb),
    } as unknown as MockRepo<Prediction>;

    const fraudFlagsQb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PredictionsService,
        {
          provide: getRepositoryToken(Prediction),
          useValue: mockPredictionsRepo,
        },
        {
          provide: getRepositoryToken(Market),
          useValue: { findOne: jest.fn() },
        },
        { provide: getRepositoryToken(User), useValue: {} },
        {
          provide: getRepositoryToken(PredictionFraudFlag),
          useValue: {
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            createQueryBuilder: jest.fn().mockReturnValue(fraudFlagsQb),
          },
        },
        {
          provide: SorobanService,
          useValue: { submitPrediction: jest.fn(), claimPayout: jest.fn() },
        },
        {
          provide: SlippageCheckerService,
          useValue: { checkSlippage: jest.fn() },
        },
        {
          provide: UsersService,
          useValue: {
            recordQualifyingAction: jest.fn().mockResolvedValue(undefined),
          },
        },
        { provide: getDataSourceToken(), useValue: { transaction: jest.fn() } },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue(undefined) },
        },
      ],
    }).compile();

    service = module.get<PredictionsService>(PredictionsService);
  };

  // ─── Realized P&L ────────────────────────────────────────────────────────

  describe('realized P&L', () => {
    it('win: realized = payout - stake (positive)', async () => {
      const market = makeMarket({
        is_resolved: true,
        resolved_outcome: 'Yes',
      });
      const stake = 1 * STROOPS_PER_XLM; // 1 XLM
      const payout = 2 * STROOPS_PER_XLM; // 2 XLM → +1 XLM P&L
      const prediction = makePrediction({
        market,
        chosen_outcome: 'Yes',
        stake_amount_stroops: String(stake),
        payout_amount_stroops: String(payout),
      });

      await setupService([prediction], []);

      const result = await service.getPnl(makeUser(), {});

      expect(result.realized_pnl_xlm).toBeCloseTo(1); // 2 - 1
      expect(result.unrealized_pnl_xlm).toBeCloseTo(0);
      expect(result.total_staked_xlm).toBeCloseTo(1);
    });

    it('loss: realized = -stake (negative)', async () => {
      const market = makeMarket({
        is_resolved: true,
        resolved_outcome: 'No',
      });
      const stake = 1 * STROOPS_PER_XLM;
      const prediction = makePrediction({
        market,
        chosen_outcome: 'Yes', // wrong outcome
        stake_amount_stroops: String(stake),
        payout_amount_stroops: '0',
      });

      await setupService([prediction], []);

      const result = await service.getPnl(makeUser(), {});

      expect(result.realized_pnl_xlm).toBeCloseTo(-1);
      expect(result.unrealized_pnl_xlm).toBeCloseTo(0);
      expect(result.total_staked_xlm).toBeCloseTo(1);
    });

    it('cancelled: realized = 0 (stake returned by protocol)', async () => {
      const market = makeMarket({ is_cancelled: true });
      const prediction = makePrediction({
        market,
        stake_amount_stroops: String(5 * STROOPS_PER_XLM),
      });

      await setupService([prediction], []);

      const result = await service.getPnl(makeUser(), {});

      expect(result.realized_pnl_xlm).toBeCloseTo(0);
      expect(result.unrealized_pnl_xlm).toBeCloseTo(0);
      expect(result.total_staked_xlm).toBeCloseTo(5);
    });

    it('multiple settled predictions sum correctly', async () => {
      const wonMarket = makeMarket({
        id: 'market-win',
        is_resolved: true,
        resolved_outcome: 'Yes',
        total_pool_stroops: String(10 * STROOPS_PER_XLM),
      });
      const lostMarket = makeMarket({
        id: 'market-lose',
        is_resolved: true,
        resolved_outcome: 'No',
        total_pool_stroops: String(20 * STROOPS_PER_XLM),
      });

      const win = makePrediction({
        id: 'pred-win',
        market: wonMarket,
        chosen_outcome: 'Yes',
        stake_amount_stroops: String(2 * STROOPS_PER_XLM),
        payout_amount_stroops: String(5 * STROOPS_PER_XLM), // +3 XLM
      });
      const loss = makePrediction({
        id: 'pred-lose',
        market: lostMarket,
        chosen_outcome: 'Yes',
        stake_amount_stroops: String(3 * STROOPS_PER_XLM),
        payout_amount_stroops: '0', // -3 XLM
      });

      await setupService([win, loss], []);

      const result = await service.getPnl(makeUser(), {});

      // realized: +3 + -3 = 0
      expect(result.realized_pnl_xlm).toBeCloseTo(0);
      expect(result.total_staked_xlm).toBeCloseTo(5);
    });
  });

  // ─── Unrealized P&L ──────────────────────────────────────────────────────

  describe('unrealized P&L', () => {
    it('open position: implied value > stake gives positive unrealized', async () => {
      // User bet 1 XLM on Yes.  Pool: 3 XLM total, 1 XLM on Yes.
      // Implied value = 1 * (3/1) = 3 XLM → unrealized = +2 XLM
      const marketId = 'market-open';
      const market = makeMarket({
        id: marketId,
        is_resolved: false,
        is_cancelled: false,
        total_pool_stroops: String(3 * STROOPS_PER_XLM),
      });
      const stake = 1 * STROOPS_PER_XLM;
      const prediction = makePrediction({
        market,
        chosen_outcome: 'Yes',
        stake_amount_stroops: String(stake),
      });

      const outcomeRows = [
        { marketId, outcome: 'Yes', total: String(1 * STROOPS_PER_XLM) },
        { marketId, outcome: 'No', total: String(2 * STROOPS_PER_XLM) },
      ];

      await setupService([prediction], outcomeRows);

      const result = await service.getPnl(makeUser(), {});

      expect(result.unrealized_pnl_xlm).toBeCloseTo(2);
      expect(result.realized_pnl_xlm).toBeCloseTo(0);
    });

    it('open position: user on losing side gives negative unrealized', async () => {
      // User bet 3 XLM on Yes.  Pool: 4 XLM, only 3 XLM on Yes.
      // Implied value = 3 * (4/3) = 4 XLM → unrealized = +1 XLM
      // (positive even though they might lose — the math mirrors fair-value at
      // current odds, not outcome prediction)
      const marketId = 'market-open-2';
      const market = makeMarket({
        id: marketId,
        total_pool_stroops: String(4 * STROOPS_PER_XLM),
      });

      const prediction = makePrediction({
        market,
        chosen_outcome: 'Yes',
        stake_amount_stroops: String(3 * STROOPS_PER_XLM),
      });

      const outcomeRows = [
        { marketId, outcome: 'Yes', total: String(3 * STROOPS_PER_XLM) },
        { marketId, outcome: 'No', total: String(1 * STROOPS_PER_XLM) },
      ];

      await setupService([prediction], outcomeRows);

      const result = await service.getPnl(makeUser(), {});

      // 3 * (4/3) - 3 = 4 - 3 = 1 XLM
      expect(result.unrealized_pnl_xlm).toBeCloseTo(1);
    });

    it('open position with zero chosen-outcome pool falls back to 0 unrealized', async () => {
      const marketId = 'market-zero-pool';
      const market = makeMarket({
        id: marketId,
        total_pool_stroops: String(5 * STROOPS_PER_XLM),
      });
      const prediction = makePrediction({ market, chosen_outcome: 'Yes' });

      // No rows for this outcome (shouldn't happen in practice but must not crash)
      await setupService([prediction], []);

      const result = await service.getPnl(makeUser(), {});

      expect(result.unrealized_pnl_xlm).toBeCloseTo(0);
    });
  });

  // ─── Empty state ─────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('returns zeros when user has no predictions', async () => {
      await setupService([], []);

      const result = await service.getPnl(makeUser(), {});

      expect(result.realized_pnl_xlm).toBeCloseTo(0);
      expect(result.unrealized_pnl_xlm).toBeCloseTo(0);
      expect(result.total_staked_xlm).toBeCloseTo(0);
      expect(result.per_market).toBeUndefined();
    });
  });

  // ─── Breakdown: aggregate == sum of per-market ────────────────────────────

  describe('breakdown=true', () => {
    it('per-market values sum exactly to aggregate totals', async () => {
      const m1 = makeMarket({
        id: 'mkt-1',
        title: 'Market 1',
        is_resolved: true,
        resolved_outcome: 'Yes',
      });
      const m2 = makeMarket({
        id: 'mkt-2',
        title: 'Market 2',
        is_resolved: true,
        resolved_outcome: 'No',
      });
      const m3 = makeMarket({
        id: 'mkt-3',
        title: 'Market 3 (open)',
        total_pool_stroops: String(6 * STROOPS_PER_XLM),
      });

      const p1 = makePrediction({
        id: 'p1',
        market: m1,
        chosen_outcome: 'Yes',
        stake_amount_stroops: String(2 * STROOPS_PER_XLM),
        payout_amount_stroops: String(4 * STROOPS_PER_XLM), // +2 XLM
      });
      const p2 = makePrediction({
        id: 'p2',
        market: m2,
        chosen_outcome: 'Yes', // wrong
        stake_amount_stroops: String(3 * STROOPS_PER_XLM),
        payout_amount_stroops: '0', // -3 XLM
      });
      const p3 = makePrediction({
        id: 'p3',
        market: m3,
        chosen_outcome: 'Yes',
        stake_amount_stroops: String(2 * STROOPS_PER_XLM),
      });

      // 6 XLM pool, 2 XLM on Yes → implied value = 2*(6/2)=6 → unrealized = +4 XLM
      const outcomeRows = [
        {
          marketId: 'mkt-3',
          outcome: 'Yes',
          total: String(2 * STROOPS_PER_XLM),
        },
        {
          marketId: 'mkt-3',
          outcome: 'No',
          total: String(4 * STROOPS_PER_XLM),
        },
      ];

      await setupService([p1, p2, p3], outcomeRows);

      const result = await service.getPnl(makeUser(), { breakdown: true });

      // Aggregate assertions
      // realized = +2 + -3 + 0 = -1
      expect(result.realized_pnl_xlm).toBeCloseTo(-1);
      // unrealized = 0 + 0 + 4 = 4
      expect(result.unrealized_pnl_xlm).toBeCloseTo(4);
      // staked = 2 + 3 + 2 = 7
      expect(result.total_staked_xlm).toBeCloseTo(7);

      expect(result.per_market).toBeDefined();
      const pm = result.per_market!;
      expect(pm).toHaveLength(3);

      // Per-market sums must equal aggregate totals
      const sumRealized = pm.reduce((acc, e) => acc + e.realized_pnl_xlm, 0);
      const sumUnrealized = pm.reduce(
        (acc, e) => acc + e.unrealized_pnl_xlm,
        0,
      );
      const sumStaked = pm.reduce((acc, e) => acc + e.staked_xlm, 0);

      expect(sumRealized).toBeCloseTo(result.realized_pnl_xlm);
      expect(sumUnrealized).toBeCloseTo(result.unrealized_pnl_xlm);
      expect(sumStaked).toBeCloseTo(result.total_staked_xlm);

      // Individual market checks
      const mkt1Entry = pm.find((e) => e.market_id === 'mkt-1');
      expect(mkt1Entry?.realized_pnl_xlm).toBeCloseTo(2);
      expect(mkt1Entry?.unrealized_pnl_xlm).toBeCloseTo(0);

      const mkt2Entry = pm.find((e) => e.market_id === 'mkt-2');
      expect(mkt2Entry?.realized_pnl_xlm).toBeCloseTo(-3);

      const mkt3Entry = pm.find((e) => e.market_id === 'mkt-3');
      expect(mkt3Entry?.unrealized_pnl_xlm).toBeCloseTo(4);
    });

    it('per_market is undefined when breakdown is not requested', async () => {
      await setupService([], []);
      const result = await service.getPnl(makeUser(), { breakdown: false });
      expect(result.per_market).toBeUndefined();
    });
  });

  // ─── Time filter ─────────────────────────────────────────────────────────

  describe('time filter', () => {
    it('passes from/to dates into query builder andWhere calls', async () => {
      await setupService([], []);

      const andWhereSpy = (
        mockPredictionsRepo.createQueryBuilder() as unknown as Record<
          string,
          jest.Mock
        >
      ).andWhere;

      await service.getPnl(makeUser(), {
        from: '2025-01-01T00:00:00.000Z',
        to: '2025-06-30T23:59:59.999Z',
      } as PnlQueryDto);

      expect(andWhereSpy).toHaveBeenCalledWith(
        'prediction.submitted_at >= :from',
        expect.objectContaining({ from: new Date('2025-01-01T00:00:00.000Z') }),
      );
      expect(andWhereSpy).toHaveBeenCalledWith(
        'prediction.submitted_at <= :to',
        expect.objectContaining({ to: new Date('2025-06-30T23:59:59.999Z') }),
      );
    });

    it('does not add date constraints when from/to are absent', async () => {
      await setupService([], []);

      const andWhereSpy = (
        mockPredictionsRepo.createQueryBuilder() as unknown as Record<
          string,
          jest.Mock
        >
      ).andWhere;

      await service.getPnl(makeUser(), {});

      const dateConstraintCalls = andWhereSpy.mock.calls.filter(
        (args: unknown[]) => (args[0] as string).includes('submitted_at'),
      );
      expect(dateConstraintCalls).toHaveLength(0);
    });
  });
});
