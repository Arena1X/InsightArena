import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken, getDataSourceToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { ConflictException } from '@nestjs/common';
import {
  BatchSizeExceededException,
  BatchValidationFailedException,
  BatchChainSubmissionFailedException,
} from './exceptions';
import { ObjectLiteral } from 'typeorm';
import { PredictionsService } from './predictions.service';
import { Prediction } from './entities/prediction.entity';
import {
  FraudSignalType,
  PredictionFraudFlag,
} from './entities/prediction-fraud-flag.entity';
import { Market } from '../markets/entities/market.entity';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { SorobanService } from '../soroban/soroban.service';
import { SlippageCheckerService } from './services/slippage-checker.service';
import { BATCH_ROLLED_BACK_REASON } from './dto/submit-batch-prediction.dto';

type MockRepo<T extends ObjectLiteral> = Record<string, jest.Mock>;

const makeUser = (overrides: Partial<User> = {}): User =>
  ({
    id: 'user-uuid-1',
    stellar_address: 'GABC1234',
    username: 'alice',
    total_predictions: 0,
    total_staked_stroops: '0',
    role: 'user',
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  }) as User;

const makeMarket = (
  id: string,
  onChainId: string,
  overrides: Partial<Market> = {},
): Market =>
  ({
    id,
    on_chain_market_id: onChainId,
    title: `Market ${id}`,
    description: 'desc',
    category: 'Crypto',
    outcome_options: ['Yes', 'No'],
    end_time: new Date(Date.now() + 86400000),
    resolution_time: new Date(Date.now() + 172800000),
    is_resolved: false,
    is_public: true,
    is_cancelled: false,
    is_paused: false,
    total_pool_stroops: '0',
    participant_count: 0,
    created_at: new Date(),
    ...overrides,
  }) as Market;

// Helper to generate deterministic UUIDs for idempotency keys in format: 00000000-0000-4000-a000-000000000XXX
const makeIdempotencyKey = (index: number): string => {
  const padded = String(index).padStart(3, '0');
  return `00000000-0000-4000-a000-000000000${padded}`;
};

describe('PredictionsService - submitBatch', () => {
  let service: PredictionsService;
  let mockPredictionsRepo: MockRepo<Prediction>;
  let mockMarketsRepo: MockRepo<Market>;
  let mockSoroban: { submitPrediction: jest.Mock };
  let savedEntities: Partial<Prediction>[];
  let marketUpdates: number;

  const buildService = async () => {
    savedEntities = [];
    marketUpdates = 0;

    const qbMock = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      setParameters: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      setParameter: jest.fn().mockReturnThis(),
      execute: jest.fn(() => {
        marketUpdates++;
        return Promise.resolve(undefined);
      }),
    };

    mockPredictionsRepo = {
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]), // Default: no existing predictions
      create: jest.fn((v) => v),
      save: jest.fn((v) => v),
      createQueryBuilder: jest.fn(),
    };

    mockMarketsRepo = {
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn((v) => v),
      save: jest.fn((v) => v),
    };

    mockSoroban = {
      submitPrediction: jest.fn().mockResolvedValue({
        tx_hash: 'tx-batch-1',
        realized_price: '5000000',
        shares_received: '2000000',
      }),
    };

    const fraudQbMock = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
    };

    const fraudFlagsRepo = {
      findOne: jest.fn(),
      create: jest.fn((v) => v),
      save: jest.fn((v) => v),
      createQueryBuilder: jest.fn().mockReturnValue(fraudQbMock),
    };

    const mockDataSource = {
      transaction: jest.fn(
        async (cb: (manager: unknown) => Promise<unknown>) => {
          const manager = {
            create: (_entity: unknown, data: Partial<Prediction>) => data,
            save: (entity: Partial<Prediction>) => {
              savedEntities.push(entity);
              return Promise.resolve({
                id: `pred-${savedEntities.length}`,
                ...entity,
              });
            },
            createQueryBuilder: () => qbMock,
          };
          return cb(manager);
        },
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PredictionsService,
        {
          provide: getRepositoryToken(Prediction),
          useValue: mockPredictionsRepo,
        },
        { provide: getRepositoryToken(Market), useValue: mockMarketsRepo },
        { provide: getRepositoryToken(User), useValue: {} },
        {
          provide: getRepositoryToken(PredictionFraudFlag),
          useValue: fraudFlagsRepo,
        },
        { provide: SorobanService, useValue: mockSoroban },
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
        {
          provide: PredictionFraudRulesService,
          useValue: { evaluate: jest.fn().mockResolvedValue([]) },
        },
        { provide: getDataSourceToken(), useValue: mockDataSource },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue(undefined) },
        },
      ],
    }).compile();

    service = module.get<PredictionsService>(PredictionsService);
  };

  beforeEach(buildService);

  it('submits a full slip atomically and persists every prediction', async () => {
    const user = makeUser();
    const marketA = makeMarket('market-a', 'on-chain-a');
    const marketB = makeMarket('market-b', 'on-chain-b');
    mockMarketsRepo.find.mockResolvedValue([marketA, marketB]);
    mockPredictionsRepo.find.mockResolvedValue([]); // Explicitly reset for this test

    const result = await service.submitBatch(
      {
        atomic: true,
        clientIdempotencyKey: makeIdempotencyKey(1),
        predictions: [
          {
            market_id: marketA.id,
            chosen_outcome: 'Yes',
            stake_amount_stroops: '10000000',
            clientIdempotencyKey: makeIdempotencyKey(11),
          },
          {
            market_id: marketB.id,
            chosen_outcome: 'No',
            stake_amount_stroops: '5000000',
            clientIdempotencyKey: makeIdempotencyKey(12),
          },
        ],
      },
      user,
    );

    expect(result.atomic).toBe(true);
    expect(result.succeeded).toBe(2);
    expect(result.failed).toBe(0);
    expect(mockSoroban.submitPrediction).toHaveBeenCalledTimes(2);
    expect(mockSoroban.submitPrediction).toHaveBeenNthCalledWith(
      1,
      user.stellar_address,
      'on-chain-a',
      'Yes',
      '10000000',
    );
    expect(savedEntities).toHaveLength(2);
    expect(result.results.map((r) => r.status)).toEqual([
      'fulfilled',
      'fulfilled',
    ]);
    expect(result.results.every((r) => r.prediction)).toBe(true);
    expect(marketUpdates).toBe(3); // 2 market counter updates + 1 aggregate user update
  });

  it('rejects the entire slip when any item fails validation (atomic mode)', async () => {
    const user = makeUser();
    const marketA = makeMarket('market-a', 'on-chain-a');
    mockMarketsRepo.find.mockResolvedValue([marketA]); // market-b missing
    mockPredictionsRepo.find.mockResolvedValue([]);

    await expect(
      service.submitBatch(
        {
          atomic: true,
          clientIdempotencyKey: makeIdempotencyKey(2),
          predictions: [
            {
              market_id: marketA.id,
              chosen_outcome: 'Yes',
              stake_amount_stroops: '10000000',
              clientIdempotencyKey: makeIdempotencyKey(21),
            },
            {
              market_id: 'missing-market',
              chosen_outcome: 'Yes',
              stake_amount_stroops: '10000000',
              clientIdempotencyKey: makeIdempotencyKey(22),
            },
          ],
        },
        user,
      ),
    ).rejects.toThrow(BatchValidationFailedException);

    // Nothing touched the chain and nothing was persisted.
    expect(mockSoroban.submitPrediction).not.toHaveBeenCalled();
    expect(savedEntities).toHaveLength(0);
  });

  it('returns per-item results in non-atomic mode with partial success', async () => {
    const user = makeUser();
    const marketA = makeMarket('market-a', 'on-chain-a');
    mockMarketsRepo.find.mockResolvedValue([marketA]);
    mockPredictionsRepo.find.mockResolvedValue([]);

    const result = await service.submitBatch(
      {
        atomic: false,
        clientIdempotencyKey: makeIdempotencyKey(3),
        predictions: [
          {
            market_id: marketA.id,
            chosen_outcome: 'Yes',
            stake_amount_stroops: '10000000',
            clientIdempotencyKey: makeIdempotencyKey(31),
          },
          {
            market_id: 'missing-market',
            chosen_outcome: 'Yes',
            stake_amount_stroops: '10000000',
            clientIdempotencyKey: makeIdempotencyKey(32),
          },
        ],
      },
      user,
    );

    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.results[0].status).toBe('fulfilled');
    expect(result.results[1].status).toBe('rejected');
    expect(result.results[1].error).toContain(
      'Market "missing-market" not found',
    );
    expect(mockSoroban.submitPrediction).toHaveBeenCalledTimes(1);
    expect(savedEntities).toHaveLength(1);
  });

  it('rejects duplicate predictions for the same market within one slip', async () => {
    const user = makeUser();
    const marketA = makeMarket('market-a', 'on-chain-a');
    mockMarketsRepo.find.mockResolvedValue([marketA]);
    mockPredictionsRepo.find.mockResolvedValue([]);

    const result = await service.submitBatch(
      {
        atomic: false,
        clientIdempotencyKey: makeIdempotencyKey(4),
        predictions: [
          {
            market_id: marketA.id,
            chosen_outcome: 'Yes',
            stake_amount_stroops: '10000000',
            clientIdempotencyKey: makeIdempotencyKey(41),
          },
          {
            market_id: marketA.id,
            chosen_outcome: 'No',
            stake_amount_stroops: '10000000',
            clientIdempotencyKey: makeIdempotencyKey(42),
          },
        ],
      },
      user,
    );

    expect(result.results[1].status).toBe('rejected');
    expect(result.results[1].error).toBe(
      'Duplicate prediction for this market within the batch',
    );
    expect(savedEntities).toHaveLength(1);
  });

  it('rejects items for markets the user has already predicted on', async () => {
    const user = makeUser();
    const marketA = makeMarket('market-a', 'on-chain-a');
    mockMarketsRepo.find.mockResolvedValue([marketA]);
    mockPredictionsRepo.find.mockResolvedValue([
      {
        id: 'existing-pred',
        market: { id: marketA.id },
        chosen_outcome: 'Yes',
      } as Prediction,
    ]);

    const result = await service
      .submitBatch(
        {
          atomic: true,
          clientIdempotencyKey: makeIdempotencyKey(5),
          predictions: [
            {
              market_id: marketA.id,
              chosen_outcome: 'Yes',
              stake_amount_stroops: '10000000',
              clientIdempotencyKey: makeIdempotencyKey(51),
            },
          ],
        },
        user,
      )
      .catch((err) => err);

    // Atomic mode -> whole slip rejected with the duplicate reason.
    expect(result).toBeInstanceOf(BatchValidationFailedException);
    expect(result.response.error.errors[0].error).toBe(
      'You have already submitted a prediction for this market',
    );
    expect(mockSoroban.submitPrediction).not.toHaveBeenCalled();
  });

  it('rejects items whose chosen outcome is not offered by the market', async () => {
    const user = makeUser();
    const marketA = makeMarket('market-a', 'on-chain-a');
    mockMarketsRepo.find.mockResolvedValue([marketA]);
    mockPredictionsRepo.find.mockResolvedValue([]);

    const result = await service.submitBatch(
      {
        atomic: false,
        clientIdempotencyKey: makeIdempotencyKey(6),
        predictions: [
          {
            market_id: marketA.id,
            chosen_outcome: 'Maybe',
            stake_amount_stroops: '10000000',
            clientIdempotencyKey: makeIdempotencyKey(61),
          },
        ],
      },
      user,
    );

    expect(result.results[0].status).toBe('rejected');
    expect(result.results[0].error).toContain(
      'Invalid outcome "Maybe". Valid options: Yes, No',
    );
    expect(mockSoroban.submitPrediction).not.toHaveBeenCalled();
  });

  it('aborts everything before persisting when an on-chain call fails in atomic mode', async () => {
    const user = makeUser();
    const marketA = makeMarket('market-a', 'on-chain-a');
    const marketB = makeMarket('market-b', 'on-chain-b');
    mockMarketsRepo.find.mockResolvedValue([marketA, marketB]);
    mockPredictionsRepo.find.mockResolvedValue([]);
    mockSoroban.submitPrediction
      .mockResolvedValueOnce({
        tx_hash: 'tx-ok',
        realized_price: '5000000',
        shares_received: '2000000',
      })
      .mockRejectedValueOnce(new Error('ledger error'));

    await expect(
      service.submitBatch(
        {
          atomic: true,
          clientIdempotencyKey: makeIdempotencyKey(7),
          predictions: [
            {
              market_id: marketA.id,
              chosen_outcome: 'Yes',
              stake_amount_stroops: '10000000',
              clientIdempotencyKey: makeIdempotencyKey(71),
            },
            {
              market_id: marketB.id,
              chosen_outcome: 'No',
              stake_amount_stroops: '10000000',
              clientIdempotencyKey: makeIdempotencyKey(72),
            },
          ],
        },
        user,
      ),
    ).rejects.toThrow(BatchChainSubmissionFailedException);

    // First chain call succeeded but nothing may be persisted.
    expect(savedEntities).toHaveLength(0);
  });

  it('enforces the maximum batch size', async () => {
    const user = makeUser();
    const items = Array.from({ length: 21 }, (_, i) => ({
      market_id: `market-${i}`,
      chosen_outcome: 'Yes',
      stake_amount_stroops: '10000000',
      clientIdempotencyKey: makeIdempotencyKey(i + 80),
    }));

    await expect(
      service.submitBatch(
        {
          atomic: true,
          clientIdempotencyKey: makeIdempotencyKey(8),
          predictions: items,
        },
        user,
      ),
    ).rejects.toThrow(BatchSizeExceededException);

    expect(mockMarketsRepo.find).not.toHaveBeenCalled();
  });

  it('reports per-item chain failures without aborting valid items in non-atomic mode', async () => {
    const user = makeUser();
    const marketA = makeMarket('market-a', 'on-chain-a');
    const marketB = makeMarket('market-b', 'on-chain-b');
    mockMarketsRepo.find.mockResolvedValue([marketA, marketB]);
    mockPredictionsRepo.find.mockResolvedValue([]);
    mockSoroban.submitPrediction
      .mockRejectedValueOnce(new Error('ledger error'))
      .mockResolvedValueOnce({
        tx_hash: 'tx-ok',
        realized_price: '5000000',
        shares_received: '2000000',
      });

    const result = await service.submitBatch(
      {
        atomic: false,
        clientIdempotencyKey: makeIdempotencyKey(9),
        predictions: [
          {
            market_id: marketA.id,
            chosen_outcome: 'Yes',
            stake_amount_stroops: '10000000',
            clientIdempotencyKey: makeIdempotencyKey(91),
          },
          {
            market_id: marketB.id,
            chosen_outcome: 'No',
            stake_amount_stroops: '10000000',
            clientIdempotencyKey: makeIdempotencyKey(92),
          },
        ],
      },
      user,
    );

    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.results[0].status).toBe('rejected');
    expect(result.results[0].error).toContain('On-chain submission failed');
    expect(result.results[1].status).toBe('fulfilled');
    expect(savedEntities).toHaveLength(1);
  });

  describe('partial-failure policy', () => {
    it('rolls back the whole slip and reports every item when one item is invalid (atomic)', async () => {
      const user = makeUser();
      const marketA = makeMarket('market-a', 'on-chain-a');
      const marketB = makeMarket('market-b', 'on-chain-b');
      mockMarketsRepo.find.mockResolvedValue([marketA, marketB]);
      mockPredictionsRepo.find.mockResolvedValue([]);

      const err = await service
        .submitBatch(
          {
            clientIdempotencyKey: makeIdempotencyKey(100),
            predictions: [
              {
                market_id: marketA.id,
                chosen_outcome: 'Yes',
                stake_amount_stroops: '10000000',
                clientIdempotencyKey: makeIdempotencyKey(101),
              },
              {
                market_id: marketB.id,
                chosen_outcome: 'Maybe',
                stake_amount_stroops: '10000000',
                clientIdempotencyKey: makeIdempotencyKey(102),
              },
            ],
          },
          user,
        )
        .catch((e) => e);

      expect(err).toBeInstanceOf(BatchValidationFailedException);
      expect(err.response.error.errors).toEqual([
        {
          index: 1,
          error: 'Invalid outcome "Maybe". Valid options: Yes, No',
        },
      ]);
      expect(err.response.error.results).toEqual([
        {
          index: 0,
          market_id: marketA.id,
          status: 'rejected',
          error: BATCH_ROLLED_BACK_REASON,
        },
        {
          index: 1,
          market_id: marketB.id,
          status: 'rejected',
          error: 'Invalid outcome "Maybe". Valid options: Yes, No',
        },
      ]);
      expect(mockSoroban.submitPrediction).not.toHaveBeenCalled();
      expect(savedEntities).toHaveLength(0);
    });

    it('reports per-item outcomes when an on-chain failure rolls back an atomic slip', async () => {
      const user = makeUser();
      const marketA = makeMarket('market-a', 'on-chain-a');
      const marketB = makeMarket('market-b', 'on-chain-b');
      const marketC = makeMarket('market-c', 'on-chain-c');
      mockMarketsRepo.find.mockResolvedValue([marketA, marketB, marketC]);
      mockPredictionsRepo.find.mockResolvedValue([]);
      mockSoroban.submitPrediction
        .mockResolvedValueOnce({
          tx_hash: 'tx-ok',
          realized_price: '5000000',
          shares_received: '2000000',
        })
        .mockRejectedValueOnce(new Error('ledger error'));

      const err = await service
        .submitBatch(
          {
            atomic: true,
            clientIdempotencyKey: makeIdempotencyKey(110),
            predictions: [marketA, marketB, marketC].map((m, i) => ({
              market_id: m.id,
              chosen_outcome: 'Yes',
              stake_amount_stroops: '10000000',
              clientIdempotencyKey: makeIdempotencyKey(111 + i),
            })),
          },
          user,
        )
        .catch((e) => e);

      expect(err).toBeInstanceOf(BatchChainSubmissionFailedException);
      const results = err.response.error.results;
      expect(results).toHaveLength(3);
      expect(results.map((r: { status: string }) => r.status)).toEqual([
        'rejected',
        'rejected',
        'rejected',
      ]);
      expect(results[0].error).toBe(BATCH_ROLLED_BACK_REASON);
      expect(results[1].error).toBe(
        'On-chain submission failed: ledger error',
      );
      expect(results[2].error).toBe(BATCH_ROLLED_BACK_REASON);
      // The item after the failure is never sent to the chain.
      expect(mockSoroban.submitPrediction).toHaveBeenCalledTimes(2);
      expect(savedEntities).toHaveLength(0);
    });

    it('commits every item and reports each as fulfilled for a fully valid slip', async () => {
      const user = makeUser();
      const markets = [
        makeMarket('market-a', 'on-chain-a'),
        makeMarket('market-b', 'on-chain-b'),
        makeMarket('market-c', 'on-chain-c'),
      ];
      mockMarketsRepo.find.mockResolvedValue(markets);
      mockPredictionsRepo.find.mockResolvedValue([]);

      const result = await service.submitBatch(
        {
          clientIdempotencyKey: makeIdempotencyKey(120),
          predictions: markets.map((m, i) => ({
            market_id: m.id,
            chosen_outcome: 'No',
            stake_amount_stroops: '10000000',
            clientIdempotencyKey: makeIdempotencyKey(121 + i),
          })),
        },
        user,
      );

      expect(result.atomic).toBe(true);
      expect(result.succeeded).toBe(3);
      expect(result.failed).toBe(0);
      expect(
        result.results.map((r) => [r.index, r.market_id, r.status]),
      ).toEqual([
        [0, 'market-a', 'fulfilled'],
        [1, 'market-b', 'fulfilled'],
        [2, 'market-c', 'fulfilled'],
      ]);
      expect(result.results.every((r) => r.error === undefined)).toBe(true);
      expect(savedEntities).toHaveLength(3);
    });

    it('reports per-item outcomes in best-effort mode when one item is invalid', async () => {
      const user = makeUser();
      const marketA = makeMarket('market-a', 'on-chain-a');
      const marketB = makeMarket('market-b', 'on-chain-b', {
        is_paused: true,
      });
      mockMarketsRepo.find.mockResolvedValue([marketA, marketB]);
      mockPredictionsRepo.find.mockResolvedValue([]);

      const result = await service.submitBatch(
        {
          atomic: false,
          clientIdempotencyKey: makeIdempotencyKey(130),
          predictions: [marketA, marketB].map((m, i) => ({
            market_id: m.id,
            chosen_outcome: 'Yes',
            stake_amount_stroops: '10000000',
            clientIdempotencyKey: makeIdempotencyKey(131 + i),
          })),
        },
        user,
      );

      expect(result.atomic).toBe(false);
      expect(result.results).toEqual([
        expect.objectContaining({
          index: 0,
          market_id: 'market-a',
          status: 'fulfilled',
        }),
        {
          index: 1,
          market_id: 'market-b',
          status: 'rejected',
          error: 'Market is paused - predictions are no longer accepted',
        },
      ]);
      expect(savedEntities).toHaveLength(1);
    });
  });
});
