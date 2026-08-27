import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken, getDataSourceToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
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
      find: jest.fn().mockResolvedValue([]),
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

    const result = await service.submitBatch(
      {
        atomic: true,
        predictions: [
          {
            market_id: marketA.id,
            chosen_outcome: 'Yes',
            stake_amount_stroops: '10000000',
          },
          {
            market_id: marketB.id,
            chosen_outcome: 'No',
            stake_amount_stroops: '5000000',
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

    await expect(
      service.submitBatch(
        {
          atomic: true,
          predictions: [
            {
              market_id: marketA.id,
              chosen_outcome: 'Yes',
              stake_amount_stroops: '10000000',
            },
            {
              market_id: 'missing-market',
              chosen_outcome: 'Yes',
              stake_amount_stroops: '10000000',
            },
          ],
        },
        user,
      ),
    ).rejects.toThrow(BadRequestException);

    // Nothing touched the chain and nothing was persisted.
    expect(mockSoroban.submitPrediction).not.toHaveBeenCalled();
    expect(savedEntities).toHaveLength(0);
  });

  it('returns per-item results in non-atomic mode with partial success', async () => {
    const user = makeUser();
    const marketA = makeMarket('market-a', 'on-chain-a');
    mockMarketsRepo.find.mockResolvedValue([marketA]);

    const result = await service.submitBatch(
      {
        atomic: false,
        predictions: [
          {
            market_id: marketA.id,
            chosen_outcome: 'Yes',
            stake_amount_stroops: '10000000',
          },
          {
            market_id: 'missing-market',
            chosen_outcome: 'Yes',
            stake_amount_stroops: '10000000',
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

    const result = await service.submitBatch(
      {
        atomic: false,
        predictions: [
          {
            market_id: marketA.id,
            chosen_outcome: 'Yes',
            stake_amount_stroops: '10000000',
          },
          {
            market_id: marketA.id,
            chosen_outcome: 'No',
            stake_amount_stroops: '10000000',
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
          predictions: [
            {
              market_id: marketA.id,
              chosen_outcome: 'Yes',
              stake_amount_stroops: '10000000',
            },
          ],
        },
        user,
      )
      .catch((err) => err);

    // Atomic mode -> whole slip rejected with the duplicate reason.
    expect(result).toBeInstanceOf(BadRequestException);
    expect(result.response.errors[0].error).toBe(
      'You have already submitted a prediction for this market',
    );
    expect(mockSoroban.submitPrediction).not.toHaveBeenCalled();
  });

  it('rejects items whose chosen outcome is not offered by the market', async () => {
    const user = makeUser();
    const marketA = makeMarket('market-a', 'on-chain-a');
    mockMarketsRepo.find.mockResolvedValue([marketA]);

    const result = await service.submitBatch(
      {
        atomic: false,
        predictions: [
          {
            market_id: marketA.id,
            chosen_outcome: 'Maybe',
            stake_amount_stroops: '10000000',
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
          predictions: [
            {
              market_id: marketA.id,
              chosen_outcome: 'Yes',
              stake_amount_stroops: '10000000',
            },
            {
              market_id: marketB.id,
              chosen_outcome: 'No',
              stake_amount_stroops: '10000000',
            },
          ],
        },
        user,
      ),
    ).rejects.toThrow(BadRequestException);

    // First chain call succeeded but nothing may be persisted.
    expect(savedEntities).toHaveLength(0);
  });

  it('enforces the maximum batch size', async () => {
    const user = makeUser();
    const items = Array.from({ length: 21 }, (_, i) => ({
      market_id: `market-${i}`,
      chosen_outcome: 'Yes',
      stake_amount_stroops: '10000000',
    }));

    await expect(
      service.submitBatch({ atomic: true, predictions: items }, user),
    ).rejects.toThrow(BadRequestException);

    expect(mockMarketsRepo.find).not.toHaveBeenCalled();
  });

  it('reports per-item chain failures without aborting valid items in non-atomic mode', async () => {
    const user = makeUser();
    const marketA = makeMarket('market-a', 'on-chain-a');
    const marketB = makeMarket('market-b', 'on-chain-b');
    mockMarketsRepo.find.mockResolvedValue([marketA, marketB]);
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
        predictions: [
          {
            market_id: marketA.id,
            chosen_outcome: 'Yes',
            stake_amount_stroops: '10000000',
          },
          {
            market_id: marketB.id,
            chosen_outcome: 'No',
            stake_amount_stroops: '10000000',
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
});
