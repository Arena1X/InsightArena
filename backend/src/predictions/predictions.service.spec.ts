import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken, getDataSourceToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  HttpStatus,
} from '@nestjs/common';
import { Repository, ObjectLiteral } from 'typeorm';
import { PredictionsService } from './predictions.service';
import { Prediction } from './entities/prediction.entity';
import {
  FraudFlagStatus,
  FraudSignalType,
  PredictionFraudFlag,
} from './entities/prediction-fraud-flag.entity';
import { Market } from '../markets/entities/market.entity';
import { PredictionStatus } from './dto/list-my-predictions.dto';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { SorobanService } from '../soroban/soroban.service';
import { SlippageCheckerService } from './services/slippage-checker.service';
import { SlippageExceededException } from './exceptions/slippage-exceeded.exception';

type MockRepo<T extends ObjectLiteral> = jest.Mocked<
  Pick<
    Repository<T>,
    | 'findOne'
    | 'create'
    | 'save'
    | 'findAndCount'
    | 'find'
    | 'createQueryBuilder'
  >
>;

const makeUser = (overrides: Partial<User> = {}): User =>
  ({
    id: 'user-uuid-1',
    stellar_address: 'GABC1234',
    username: 'alice',
    avatar_url: null,
    total_predictions: 0,
    correct_predictions: 0,
    total_staked_stroops: '0',
    total_winnings_stroops: '0',
    reputation_score: 0,
    season_points: 0,
    role: 'user',
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  }) as User;

const makeMarket = (overrides: Partial<Market> = {}): Market =>
  ({
    id: 'market-uuid-1',
    on_chain_market_id: 'on-chain-1',
    title: 'Will BTC reach $100k?',
    description: 'desc',
    category: 'Crypto',
    outcome_options: ['Yes', 'No'],
    end_time: new Date(Date.now() + 86400000),
    resolution_time: new Date(Date.now() + 172800000),
    is_resolved: false,
    resolved_outcome: undefined as unknown as string,
    is_public: true,
    is_cancelled: false,
    total_pool_stroops: '0',
    participant_count: 0,
    created_at: new Date(),
    creator: makeUser(),
    ...overrides,
  }) as Market;

describe('PredictionsService', () => {
  let service: PredictionsService;
  let mockPredictionsRepo: MockRepo<Prediction>;
  let mockMarketsRepo: MockRepo<Market>;
  let mockFraudFlagsRepo: MockRepo<PredictionFraudFlag>;
  let mockConfigService: jest.Mocked<ConfigService>;
  let mockSoroban: jest.Mocked<SorobanService>;
  let mockSlippageChecker: jest.Mocked<SlippageCheckerService>;
  let submitPrediction: jest.SpyInstance;
  let qbMock: {
    update: jest.Mock;
    set: jest.Mock;
    setParameters: jest.Mock;
    where: jest.Mock;
    setParameter: jest.Mock;
    execute: jest.Mock;
  };

  beforeEach(async () => {
    qbMock = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      setParameters: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      setParameter: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue(undefined),
    };

    const fraudQbMock = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
    };

    mockPredictionsRepo = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      findAndCount: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      createQueryBuilder: jest.fn().mockReturnValue(fraudQbMock),
    } as unknown as MockRepo<Prediction>;

    mockMarketsRepo = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      findAndCount: jest.fn(),
      find: jest.fn(),
    };

    mockSoroban = {
      submitPrediction: jest.fn().mockResolvedValue({
        tx_hash: 'abc123',
        realized_price: '5000000',
        shares_received: '2000000',
      }),
      claimPayout: jest.fn(),
      getEvents: jest.fn(),
    } as unknown as jest.Mocked<SorobanService>;
    submitPrediction = jest.spyOn(mockSoroban, 'submitPrediction');

    mockSlippageChecker = {
      checkSlippage: jest.fn(),
    } as unknown as jest.Mocked<SlippageCheckerService>;

    const mockDataSource = {
      transaction: jest.fn((cb: (manager: unknown) => Promise<Prediction>) => {
        const manager = {
          create: (_entity: unknown, data: Partial<Prediction>) => ({
            ...data,
          }),
          save: (entity: Partial<Prediction>) =>
            Promise.resolve({ id: 'pred-uuid-1', ...entity } as Prediction),
          createQueryBuilder: () => qbMock,
        };
        return cb(manager);
      }),
    };

    mockFraudFlagsRepo = {
      findOne: jest.fn(),
      create: jest.fn((data: Partial<PredictionFraudFlag>) => data),
      save: jest.fn((entity: Partial<PredictionFraudFlag>) =>
        Promise.resolve({ id: 'flag-uuid-1', ...entity }),
      ),
      createQueryBuilder: jest.fn().mockReturnValue({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      }),
    } as unknown as MockRepo<PredictionFraudFlag>;

    mockConfigService = {
      get: jest.fn().mockReturnValue(undefined),
    } as unknown as jest.Mocked<ConfigService>;

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
          useValue: mockFraudFlagsRepo,
        },
        { provide: SorobanService, useValue: mockSoroban },
        { provide: SlippageCheckerService, useValue: mockSlippageChecker },
        {
          provide: UsersService,
          useValue: {
            recordQualifyingAction: jest.fn().mockResolvedValue(undefined),
          },
        },
        { provide: getDataSourceToken(), useValue: mockDataSource },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<PredictionsService>(PredictionsService);
  });

  describe('submit', () => {
    it('returns prediction with realized price and shares on happy path', async () => {
      const user = makeUser();
      const market = makeMarket();
      mockMarketsRepo.findOne.mockResolvedValue(market);
      mockPredictionsRepo.findOne.mockResolvedValue(null);

      const result = await service.submit(
        {
          market_id: market.id,
          chosen_outcome: 'Yes',
          stake_amount_stroops: '10000000',
        },
        user,
      );

      // Check response structure includes realized_price and shares_received
      expect(result).toMatchObject({
        prediction: {
          tx_hash: 'abc123',
          chosen_outcome: 'Yes',
        },
        realized_price: '5000000',
        shares_received: '2000000',
      });
      expect(qbMock.setParameter).toHaveBeenCalledWith(
        'stakeAmount',
        '10000000',
      );
    });

    it('throws NotFoundException when market does not exist', async () => {
      mockMarketsRepo.findOne.mockResolvedValue(null);

      await expect(
        service.submit(
          {
            market_id: 'bad-id',
            chosen_outcome: 'Yes',
            stake_amount_stroops: '10000000',
          },
          makeUser(),
        ),
      ).rejects.toThrow(NotFoundException);
      expect(submitPrediction).not.toHaveBeenCalled();
      expect(mockSoroban.submitPrediction).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when market is resolved', async () => {
      mockMarketsRepo.findOne.mockResolvedValue(
        makeMarket({ is_resolved: true }),
      );

      await expect(
        service.submit(
          {
            market_id: 'market-uuid-1',
            chosen_outcome: 'Yes',
            stake_amount_stroops: '10000000',
          },
          makeUser(),
        ),
      ).rejects.toThrow(BadRequestException);
      expect(submitPrediction).not.toHaveBeenCalled();
      expect(mockSoroban.submitPrediction).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when market is cancelled', async () => {
      mockMarketsRepo.findOne.mockResolvedValue(
        makeMarket({ is_cancelled: true }),
      );

      await expect(
        service.submit(
          {
            market_id: 'market-uuid-1',
            chosen_outcome: 'Yes',
            stake_amount_stroops: '10000000',
          },
          makeUser(),
        ),
      ).rejects.toThrow(BadRequestException);
      expect(submitPrediction).not.toHaveBeenCalled();
      expect(mockSoroban.submitPrediction).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when end_time has passed', async () => {
      mockMarketsRepo.findOne.mockResolvedValue(
        makeMarket({ end_time: new Date(Date.now() - 1000) }),
      );

      await expect(
        service.submit(
          {
            market_id: 'market-uuid-1',
            chosen_outcome: 'Yes',
            stake_amount_stroops: '10000000',
          },
          makeUser(),
        ),
      ).rejects.toThrow(BadRequestException);
      expect(submitPrediction).not.toHaveBeenCalled();
      expect(mockSoroban.submitPrediction).not.toHaveBeenCalled();
    });

    it('throws BadRequestException for invalid outcome', async () => {
      mockMarketsRepo.findOne.mockResolvedValue(makeMarket());

      await expect(
        service.submit(
          {
            market_id: 'market-uuid-1',
            chosen_outcome: 'Maybe',
            stake_amount_stroops: '10000000',
          },
          makeUser(),
        ),
      ).rejects.toThrow(BadRequestException);
      expect(submitPrediction).not.toHaveBeenCalled();
      expect(mockSoroban.submitPrediction).not.toHaveBeenCalled();
    });

    it('throws ConflictException for duplicate prediction', async () => {
      mockMarketsRepo.findOne.mockResolvedValue(makeMarket());
      mockPredictionsRepo.findOne.mockResolvedValue({
        id: 'existing',
      } as Prediction);

      await expect(
        service.submit(
          {
            market_id: 'market-uuid-1',
            chosen_outcome: 'Yes',
            stake_amount_stroops: '10000000',
          },
          makeUser(),
        ),
      ).rejects.toThrow(ConflictException);
      expect(mockSoroban.submitPrediction).not.toHaveBeenCalled();
    });

    it('accepts prediction when slippage is within maxPrice tolerance', async () => {
      const user = makeUser();
      const market = makeMarket();
      mockMarketsRepo.findOne.mockResolvedValue(market);
      mockPredictionsRepo.findOne.mockResolvedValue(null);

      const result = await service.submit(
        {
          market_id: market.id,
          chosen_outcome: 'Yes',
          stake_amount_stroops: '10000000',
          maxPrice: '6000000', // realized_price (5000000) is under this
        },
        user,
      );

      expect(result.realized_price).toBe('5000000');
      expect(mockSlippageChecker.checkSlippage).toHaveBeenCalledWith(
        '6000000',
        undefined,
        '5000000',
        '2000000',
      );
    });

    it('accepts prediction when slippage is within minSharesOut tolerance', async () => {
      const user = makeUser();
      const market = makeMarket();
      mockMarketsRepo.findOne.mockResolvedValue(market);
      mockPredictionsRepo.findOne.mockResolvedValue(null);

      const result = await service.submit(
        {
          market_id: market.id,
          chosen_outcome: 'Yes',
          stake_amount_stroops: '10000000',
          minSharesOut: '1500000', // shares_received (2000000) is above this
        },
        user,
      );

      expect(result.shares_received).toBe('2000000');
      expect(mockSlippageChecker.checkSlippage).toHaveBeenCalledWith(
        undefined,
        '1500000',
        '5000000',
        '2000000',
      );
    });

    it('rejects prediction when price exceeds maxPrice', async () => {
      const user = makeUser();
      const market = makeMarket();
      mockMarketsRepo.findOne.mockResolvedValue(market);
      mockPredictionsRepo.findOne.mockResolvedValue(null);
      mockSlippageChecker.checkSlippage.mockImplementation(() => {
        throw new SlippageExceededException(
          '4000000',
          '5000000',
          '0',
          '2000000',
        );
      });

      await expect(
        service.submit(
          {
            market_id: market.id,
            chosen_outcome: 'Yes',
            stake_amount_stroops: '10000000',
            maxPrice: '4000000',
          },
          user,
        ),
      ).rejects.toThrow(SlippageExceededException);
      expect(mockSlippageChecker.checkSlippage).toHaveBeenCalled();
    });

    it('rejects prediction when shares fall below minSharesOut', async () => {
      const user = makeUser();
      const market = makeMarket();
      mockMarketsRepo.findOne.mockResolvedValue(market);
      mockPredictionsRepo.findOne.mockResolvedValue(null);
      mockSlippageChecker.checkSlippage.mockImplementation(() => {
        throw new SlippageExceededException(
          '0',
          '5000000',
          '3000000',
          '2000000',
        );
      });

      await expect(
        service.submit(
          {
            market_id: market.id,
            chosen_outcome: 'Yes',
            stake_amount_stroops: '10000000',
            minSharesOut: '3000000',
          },
          user,
        ),
      ).rejects.toThrow(SlippageExceededException);
      expect(mockSlippageChecker.checkSlippage).toHaveBeenCalled();
    });

    it('checks both maxPrice and minSharesOut slippage bounds', async () => {
      const user = makeUser();
      const market = makeMarket();
      mockMarketsRepo.findOne.mockResolvedValue(market);
      mockPredictionsRepo.findOne.mockResolvedValue(null);

      await service.submit(
        {
          market_id: market.id,
          chosen_outcome: 'Yes',
          stake_amount_stroops: '10000000',
          maxPrice: '6000000',
          minSharesOut: '1500000',
        },
        user,
      );

      expect(mockSlippageChecker.checkSlippage).toHaveBeenCalledWith(
        '6000000',
        '1500000',
        '5000000',
        '2000000',
      );
    });

    it('does not check slippage when bounds are not provided', async () => {
      const user = makeUser();
      const market = makeMarket();
      mockMarketsRepo.findOne.mockResolvedValue(market);
      mockPredictionsRepo.findOne.mockResolvedValue(null);

      await service.submit(
        {
          market_id: market.id,
          chosen_outcome: 'Yes',
          stake_amount_stroops: '10000000',
        },
        user,
      );

      expect(mockSlippageChecker.checkSlippage).not.toHaveBeenCalled();
    });

    it('returns default zeros when contract returns undefined price/shares', async () => {
      const user = makeUser();
      const market = makeMarket();
      mockMarketsRepo.findOne.mockResolvedValue(market);
      mockPredictionsRepo.findOne.mockResolvedValue(null);
      mockSoroban.submitPrediction.mockResolvedValue({
        tx_hash: 'abc123',
        // No realized_price or shares_received
      });

      const result = await service.submit(
        {
          market_id: market.id,
          chosen_outcome: 'Yes',
          stake_amount_stroops: '10000000',
        },
        user,
      );

      expect(result.realized_price).toBe('0');
      expect(result.shares_received).toBe('0');
    });
  });

  describe('claim', () => {
    it('successfully claims payout for a winning prediction', async () => {
      const user = makeUser();
      const market = makeMarket({
        is_resolved: true,
        resolved_outcome: 'Yes',
      });
      const prediction = {
        id: 'pred-1',
        user,
        market,
        chosen_outcome: 'Yes',
        payout_claimed: false,
        payout_amount_stroops: '0',
      } as Prediction;

      mockPredictionsRepo.findOne.mockResolvedValue(prediction);
      mockPredictionsRepo.save = jest.fn().mockResolvedValue({
        ...prediction,
        payout_claimed: true,
        tx_hash: 'claim-tx',
        payout_amount_stroops: '15000000',
      });
      mockSoroban.claimPayout.mockResolvedValue({
        tx_hash: 'claim-tx',
        payout_amount_stroops: '15000000',
      });

      const result = await service.claim('pred-1', user);

      expect(result.payout_claimed).toBe(true);
      expect(result.tx_hash).toBe('claim-tx');
      expect(result.payout_amount_stroops).toBe('15000000');

      expect(mockSoroban.claimPayout).toHaveBeenCalledWith(
        user.stellar_address,
        market.on_chain_market_id,
      );
    });

    it('persists payout_amount_stroops from Soroban response', async () => {
      const user = makeUser();
      const market = makeMarket({
        is_resolved: true,
        resolved_outcome: 'Yes',
      });
      const prediction = {
        id: 'pred-1',
        user,
        market,
        chosen_outcome: 'Yes',
        payout_claimed: false,
        payout_amount_stroops: '0',
        stake_amount_stroops: '10000000',
      } as Prediction;

      mockPredictionsRepo.findOne.mockResolvedValue(prediction);

      const saveMock = jest.fn().mockImplementation((entity: Prediction) => {
        return Promise.resolve(entity);
      });
      mockPredictionsRepo.save = saveMock;

      mockSoroban.claimPayout.mockResolvedValue({
        tx_hash: 'claim-tx-123',
        payout_amount_stroops: '20000000',
      });

      await service.claim('pred-1', user);

      expect(saveMock).toHaveBeenCalledWith(
        expect.objectContaining({
          payout_claimed: true,
          tx_hash: 'claim-tx-123',
          payout_amount_stroops: '20000000',
        }),
      );
    });

    it('throws ConflictException if already claimed', async () => {
      const user = makeUser();
      const prediction = {
        id: 'pred-1',
        user,
        payout_claimed: true,
      } as Prediction;

      mockPredictionsRepo.findOne.mockResolvedValue(prediction);

      await expect(service.claim('pred-1', user)).rejects.toThrow(
        ConflictException,
      );
    });

    it('throws BadRequestException if market not resolved', async () => {
      const user = makeUser();
      const market = makeMarket({ is_resolved: false });
      const prediction = {
        id: 'pred-1',
        user,
        market,
        chosen_outcome: 'Yes',
        payout_claimed: false,
      } as Prediction;

      mockPredictionsRepo.findOne.mockResolvedValue(prediction);

      await expect(service.claim('pred-1', user)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException if not a winner', async () => {
      const user = makeUser();
      const market = makeMarket({
        is_resolved: true,
        resolved_outcome: 'No',
      });
      const prediction = {
        id: 'pred-1',
        user,
        market,
        chosen_outcome: 'Yes',
        payout_claimed: false,
      } as Prediction;

      mockPredictionsRepo.findOne.mockResolvedValue(prediction);

      await expect(service.claim('pred-1', user)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws NotFoundException if prediction not found', async () => {
      mockPredictionsRepo.findOne.mockResolvedValue(null);
      await expect(service.claim('non-existent', makeUser())).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getRewardsSummary', () => {
    it('buckets predictions into claimable, vesting, and total earned', async () => {
      const user = makeUser();
      const resolvedWon = makeMarket({
        id: 'm-won',
        is_resolved: true,
        resolved_outcome: 'Yes',
      });
      const resolvedLost = makeMarket({
        id: 'm-lost',
        is_resolved: true,
        resolved_outcome: 'No',
      });
      const unresolved = makeMarket({ id: 'm-open', is_resolved: false });

      mockPredictionsRepo.find.mockResolvedValue([
        {
          id: 'p-claimable',
          market: resolvedWon,
          chosen_outcome: 'Yes',
          payout_claimed: false,
          stake_amount_stroops: '10000000', // 1 XLM
        },
        {
          id: 'p-lost',
          market: resolvedLost,
          chosen_outcome: 'Yes',
          payout_claimed: false,
          stake_amount_stroops: '5000000',
        },
        {
          id: 'p-vesting',
          market: unresolved,
          chosen_outcome: 'Yes',
          payout_claimed: false,
          stake_amount_stroops: '20000000', // 2 XLM
        },
        {
          id: 'p-claimed',
          market: resolvedWon,
          chosen_outcome: 'Yes',
          payout_claimed: true,
          payout_amount_stroops: '15000000', // 1.5 XLM
        },
      ] as unknown as Prediction[]);

      const result = await service.getRewardsSummary(user);

      expect(result).toEqual({
        claimable_xlm: 1,
        vesting_xlm: 2,
        total_earned_xlm: 1.5,
      });
    });

    it('returns all zeros when the user has no predictions', async () => {
      mockPredictionsRepo.find.mockResolvedValue([]);

      const result = await service.getRewardsSummary(makeUser());

      expect(result).toEqual({
        claimable_xlm: 0,
        vesting_xlm: 0,
        total_earned_xlm: 0,
      });
    });
  });

  describe('claimAllRewards', () => {
    it('claims every claimable prediction and returns an aggregated summary', async () => {
      const user = makeUser();
      const resolvedWon = makeMarket({
        id: 'm-won',
        is_resolved: true,
        resolved_outcome: 'Yes',
      });

      const claimablePredictions = [
        {
          id: 'p-1',
          user,
          market: resolvedWon,
          chosen_outcome: 'Yes',
          payout_claimed: false,
        },
        {
          id: 'p-2',
          user,
          market: resolvedWon,
          chosen_outcome: 'Yes',
          payout_claimed: false,
        },
      ] as Prediction[];

      // 1st find() call selects the claimable predictions; the 2nd is the
      // getRewardsSummary() re-read at the end, reflecting the post-claim state.
      mockPredictionsRepo.find
        .mockResolvedValueOnce(claimablePredictions)
        .mockResolvedValueOnce([
          {
            ...claimablePredictions[0],
            payout_claimed: true,
            payout_amount_stroops: '10000000',
          },
          {
            ...claimablePredictions[1],
            payout_claimed: true,
            payout_amount_stroops: '5000000',
          },
        ] as Prediction[]);

      // findOne() + save() are used internally by claim() for each prediction
      mockPredictionsRepo.findOne
        .mockResolvedValueOnce(claimablePredictions[0])
        .mockResolvedValueOnce(claimablePredictions[1]);
      mockSoroban.claimPayout
        .mockResolvedValueOnce({
          tx_hash: 'tx-1',
          payout_amount_stroops: '10000000',
        })
        .mockResolvedValueOnce({
          tx_hash: 'tx-2',
          payout_amount_stroops: '5000000',
        });
      mockPredictionsRepo.save = jest
        .fn()
        .mockImplementation((entity: Prediction) => Promise.resolve(entity));

      const result = await service.claimAllRewards(user);

      expect(result.claimed_count).toBe(2);
      expect(result.claimed_xlm).toBe(1.5);
      expect(result.transaction_hash).toBe('tx-2');
      expect(mockSoroban.claimPayout).toHaveBeenCalledTimes(2);
    });

    it('throws BadRequestException when there is nothing to claim', async () => {
      mockPredictionsRepo.find.mockResolvedValue([]);

      await expect(service.claimAllRewards(makeUser())).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('updateNote', () => {
    it('should update the note on a prediction owned by the user', async () => {
      const user = makeUser();
      const market = makeMarket();
      const prediction = {
        id: 'pred-1',
        user,
        market,
        chosen_outcome: 'Yes',
        note: null,
      } as unknown as Prediction;

      mockPredictionsRepo.findOne.mockResolvedValue(prediction);
      mockPredictionsRepo.save.mockResolvedValue({
        ...prediction,
        note: 'My analysis note',
      } as Prediction);

      const result = await service.updateNote(
        'pred-1',
        { note: 'My analysis note' },
        user,
      );

      expect(result.note).toBe('My analysis note');
      expect(mockPredictionsRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'pred-1', user: { id: user.id } },
        relations: ['market'],
      });
    });

    it('should throw NotFoundException if prediction is not found or not owned', async () => {
      mockPredictionsRepo.findOne.mockResolvedValue(null);

      await expect(
        service.updateNote('non-existent', { note: 'Some note' }, makeUser()),
      ).rejects.toThrow(NotFoundException);
      expect(submitPrediction).not.toHaveBeenCalled();
    });
  });

  describe('findById', () => {
    it('should return prediction with enriched status when owned by user', async () => {
      const user = makeUser();
      const market = makeMarket({
        is_resolved: true,
        resolved_outcome: 'Yes',
      });
      const prediction = {
        id: 'pred-1',
        user,
        market,
        chosen_outcome: 'Yes',
        stake_amount_stroops: '10000000',
        payout_claimed: false,
        payout_amount_stroops: '0',
        tx_hash: 'abc123',
        note: null,
        submitted_at: new Date(),
      } as Prediction;

      mockPredictionsRepo.findOne.mockResolvedValue(prediction);

      const result = await service.findById('pred-1', user.id);

      expect(result).toMatchObject({
        id: 'pred-1',
        chosen_outcome: 'Yes',
        status: 'won',
      });
      expect(mockPredictionsRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'pred-1' },
        relations: ['market', 'user'],
      });
    });

    it('should throw NotFoundException if prediction does not exist', async () => {
      mockPredictionsRepo.findOne.mockResolvedValue(null);

      await expect(service.findById('non-existent', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException if user does not own the prediction', async () => {
      const owner = makeUser({ id: 'owner-1' });
      const otherUser = makeUser({ id: 'other-user' });
      const market = makeMarket();
      const prediction = {
        id: 'pred-1',
        user: owner,
        market,
        chosen_outcome: 'Yes',
      } as Prediction;

      mockPredictionsRepo.findOne.mockResolvedValue(prediction);

      await expect(service.findById('pred-1', otherUser.id)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should compute correct status for active prediction', async () => {
      const user = makeUser();
      const market = makeMarket({ is_resolved: false });
      const prediction = {
        id: 'pred-1',
        user,
        market,
        chosen_outcome: 'Yes',
        stake_amount_stroops: '10000000',
        payout_claimed: false,
        payout_amount_stroops: '0',
        tx_hash: 'abc123',
        note: null,
        submitted_at: new Date(),
      } as Prediction;

      mockPredictionsRepo.findOne.mockResolvedValue(prediction);

      const result = await service.findById('pred-1', user.id);

      expect(result.status).toBe('active');
    });

    it('should compute correct status for lost prediction', async () => {
      const user = makeUser();
      const market = makeMarket({
        is_resolved: true,
        resolved_outcome: 'No',
      });
      const prediction = {
        id: 'pred-1',
        user,
        market,
        chosen_outcome: 'Yes',
        stake_amount_stroops: '10000000',
        payout_claimed: false,
        payout_amount_stroops: '0',
        tx_hash: 'abc123',
        note: null,
        submitted_at: new Date(),
      } as Prediction;

      mockPredictionsRepo.findOne.mockResolvedValue(prediction);

      const result = await service.findById('pred-1', user.id);

      expect(result.status).toBe('lost');
    });
  });

  describe('findByMarket', () => {
    it('returns anonymized and paginated predictions for an existing market', async () => {
      const market = makeMarket();
      mockMarketsRepo.findOne.mockResolvedValue(market);

      const mockPredictions = [
        {
          id: 'pred-1',
          chosen_outcome: 'Yes',
          stake_amount_stroops: '1000',
          payout_claimed: false,
          payout_amount_stroops: '0',
          tx_hash: 'tx-1',
          submitted_at: new Date(),
        },
      ];
      mockPredictionsRepo.findAndCount.mockResolvedValue([
        mockPredictions as Prediction[],
        1,
      ]);

      const result = await service.findByMarket(market.id, {
        page: 2,
        limit: 10,
      });

      expect(result.total).toBe(1);
      expect(result.page).toBe(2);
      expect(result.limit).toBe(10);
      expect(result.data[0]).toEqual({
        id: 'pred-1',
        chosen_outcome: 'Yes',
        stake_amount_stroops: '1000',
        payout_claimed: false,
        payout_amount_stroops: '0',
        tx_hash: 'tx-1',
        submitted_at: mockPredictions[0].submitted_at,
      });
      expect(result.data[0]).not.toHaveProperty('user');
      expect(result.data[0]).not.toHaveProperty('userId');
      expect(mockPredictionsRepo.findAndCount).toHaveBeenCalledWith({
        where: { market: { id: market.id } },
        order: { submitted_at: 'DESC' },
        skip: 10,
        take: 10,
      });
    });

    it('returns empty list for non-existent market', async () => {
      mockMarketsRepo.findOne.mockResolvedValue(null);

      const result = await service.findByMarket('non-existent', {
        page: 1,
        limit: 10,
      });

      expect(result.total).toBe(0);
      expect(result.data).toEqual([]);
      expect(mockPredictionsRepo.findAndCount).not.toHaveBeenCalled();
    });
  });

  describe('findMine with status filter', () => {
    let qbMock: {
      leftJoinAndSelect: jest.Mock;
      where: jest.Mock;
      andWhere: jest.Mock;
      orderBy: jest.Mock;
      skip: jest.Mock;
      take: jest.Mock;
      getManyAndCount: jest.Mock;
    };

    beforeEach(() => {
      qbMock = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      };

      mockPredictionsRepo.createQueryBuilder = jest
        .fn()
        .mockReturnValue(qbMock);
    });

    it('should apply status filter at database level for Won status', async () => {
      const user = makeUser();
      const wonMarket = makeMarket({
        is_resolved: true,
        resolved_outcome: 'Yes',
      });
      const wonPrediction = {
        id: 'pred-won',
        user,
        market: wonMarket,
        chosen_outcome: 'Yes',
        stake_amount_stroops: '10000000',
        payout_claimed: false,
        payout_amount_stroops: '0',
        tx_hash: 'tx-won',
        submitted_at: new Date(),
      } as Prediction;

      qbMock.getManyAndCount.mockResolvedValue([[wonPrediction], 1]);

      const result = await service.findMine(user, {
        page: 1,
        limit: 20,
        status: PredictionStatus.Won,
      });

      expect(result.total).toBe(1);
      expect(result.data).toHaveLength(1);
      expect(qbMock.andWhere).toHaveBeenCalledWith(
        'market.is_resolved = :isResolved',
        {
          isResolved: true,
        },
      );
      expect(qbMock.andWhere).toHaveBeenCalledWith(
        'market.is_cancelled = :isCancelled',
        {
          isCancelled: false,
        },
      );
      expect(qbMock.andWhere).toHaveBeenCalledWith(
        'market.resolved_outcome = prediction.chosen_outcome',
      );
    });

    it('should apply status filter at database level for Active status', async () => {
      const user = makeUser();

      await service.findMine(user, {
        page: 1,
        limit: 20,
        status: PredictionStatus.Active,
      });

      expect(qbMock.andWhere).toHaveBeenCalledWith(
        'market.is_resolved = :isResolved',
        {
          isResolved: false,
        },
      );
      expect(qbMock.andWhere).toHaveBeenCalledWith(
        'market.is_cancelled = :isCancelled',
        {
          isCancelled: false,
        },
      );
    });

    it('should apply status filter at database level for Lost status', async () => {
      const user = makeUser();

      await service.findMine(user, {
        page: 1,
        limit: 20,
        status: PredictionStatus.Lost,
      });

      expect(qbMock.andWhere).toHaveBeenCalledWith(
        'market.is_resolved = :isResolved',
        {
          isResolved: true,
        },
      );
      expect(qbMock.andWhere).toHaveBeenCalledWith(
        'market.is_cancelled = :isCancelled',
        {
          isCancelled: false,
        },
      );
      expect(qbMock.andWhere).toHaveBeenCalledWith(
        'market.resolved_outcome != prediction.chosen_outcome',
      );
    });

    it('should apply status filter at database level for Pending status', async () => {
      const user = makeUser();

      await service.findMine(user, {
        page: 1,
        limit: 20,
        status: PredictionStatus.Pending,
      });

      expect(qbMock.andWhere).toHaveBeenCalledWith(
        'market.is_cancelled = :isCancelled',
        {
          isCancelled: true,
        },
      );
    });

    it('should not filter when status is not provided', async () => {
      const user = makeUser();

      await service.findMine(user, {
        page: 1,
        limit: 20,
      });

      expect(qbMock.where).toHaveBeenCalledWith('prediction.userId = :userId', {
        userId: user.id,
      });
      // andWhere should not be called for status filtering
      const statusCalls = qbMock.andWhere.mock.calls.filter(
        (call) =>
          call[0].includes('is_resolved') ||
          call[0].includes('is_cancelled') ||
          call[0].includes('resolved_outcome'),
      );
      expect(statusCalls.length).toBe(0);
    });

    it('should return accurate total count with status filter', async () => {
      const user = makeUser();
      const wonMarket = makeMarket({
        is_resolved: true,
        resolved_outcome: 'Yes',
      });
      const predictions = Array.from({ length: 5 }, (_, i) => ({
        id: `pred-${i}`,
        user,
        market: wonMarket,
        chosen_outcome: 'Yes',
        stake_amount_stroops: '10000000',
        payout_claimed: false,
        payout_amount_stroops: '0',
        tx_hash: `tx-${i}`,
        submitted_at: new Date(),
      })) as Prediction[];

      qbMock.getManyAndCount.mockResolvedValue([predictions, 25]);

      const result = await service.findMine(user, {
        page: 1,
        limit: 5,
        status: PredictionStatus.Won,
      });

      expect(result.total).toBe(25);
      expect(result.data).toHaveLength(5);
    });
  });

  describe('exportCsv', () => {
    let csvQbMock: any;

    beforeEach(() => {
      csvQbMock = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        stream: jest.fn().mockResolvedValue({
          [Symbol.asyncIterator]: function* () {},
          on: jest.fn(),
        }),
      };
      (mockPredictionsRepo as any).createQueryBuilder = jest
        .fn()
        .mockReturnValue(csvQbMock);
    });

    it('returns a readable stream', () => {
      const user = makeUser();
      const stream = service.exportCsv(user, {});
      expect(stream).toBeDefined();
      expect(typeof stream.pipe).toBe('function');
    });

    it('builds query with date filters when provided', () => {
      const user = makeUser();
      const stream = service.exportCsv(user, {
        start_date: '2026-01-01',
        end_date: '2026-06-30',
      });
      expect(stream).toBeDefined();
      expect(csvQbMock.andWhere).toHaveBeenCalledTimes(2);
    });
  });

  describe('evaluateFraudSignalsForUser', () => {
    const makePrediction = (submittedAt: Date) =>
      ({ submitted_at: submittedAt }) as Prediction;

    beforeEach(() => {
      mockConfigService.get.mockImplementation((key: string) => {
        const values: Record<string, string> = {
          FRAUD_TIMING_MIN_SAMPLE: '3',
          FRAUD_TIMING_CLUSTER_WINDOW_SECONDS: '30',
          FRAUD_TIMING_CLUSTER_MIN_RATIO: '0.6',
          FRAUD_COUNTERPARTY_MIN_MARKETS: '3',
          FRAUD_COUNTERPARTY_HHI_THRESHOLD: '0.5',
        };
        return values[key];
      });
    });

    describe('timing clustering signal', () => {
      it('flags a user whose predictions cluster tightly in time', async () => {
        const base = Date.now();
        mockPredictionsRepo.find.mockResolvedValue([
          makePrediction(new Date(base)),
          makePrediction(new Date(base + 5_000)),
          makePrediction(new Date(base + 10_000)),
          makePrediction(new Date(base + 15_000)),
        ]);

        await service.evaluateFraudSignalsForUser('user-1');

        expect(mockFraudFlagsRepo.save).toHaveBeenCalledWith(
          expect.objectContaining({
            user_id: 'user-1',
            signal_type: FraudSignalType.TIMING_CLUSTERING,
            status: FraudFlagStatus.OPEN,
          }),
        );
      });

      it('does not flag a user with widely-spaced predictions', async () => {
        const base = Date.now();
        mockPredictionsRepo.find.mockResolvedValue([
          makePrediction(new Date(base)),
          makePrediction(new Date(base + 6 * 60 * 60 * 1000)),
          makePrediction(new Date(base + 12 * 60 * 60 * 1000)),
          makePrediction(new Date(base + 18 * 60 * 60 * 1000)),
        ]);

        await service.evaluateFraudSignalsForUser('user-1');

        expect(mockFraudFlagsRepo.save).not.toHaveBeenCalledWith(
          expect.objectContaining({
            signal_type: FraudSignalType.TIMING_CLUSTERING,
          }),
        );
      });

      it('does not evaluate below the minimum sample size', async () => {
        const base = Date.now();
        mockPredictionsRepo.find.mockResolvedValue([
          makePrediction(new Date(base)),
          makePrediction(new Date(base + 1_000)),
        ]);

        await service.evaluateFraudSignalsForUser('user-1');

        expect(mockFraudFlagsRepo.save).not.toHaveBeenCalledWith(
          expect.objectContaining({
            signal_type: FraudSignalType.TIMING_CLUSTERING,
          }),
        );
      });

      it('refreshes an existing open flag instead of duplicating it', async () => {
        const base = Date.now();
        mockPredictionsRepo.find.mockResolvedValue([
          makePrediction(new Date(base)),
          makePrediction(new Date(base + 5_000)),
          makePrediction(new Date(base + 10_000)),
        ]);
        const existingFlag = {
          id: 'existing-flag',
          user_id: 'user-1',
          signal_type: FraudSignalType.TIMING_CLUSTERING,
          status: FraudFlagStatus.OPEN,
          score: 0,
          threshold: 0.6,
          details: {},
        } as PredictionFraudFlag;
        mockFraudFlagsRepo.findOne.mockResolvedValue(existingFlag);

        await service.evaluateFraudSignalsForUser('user-1');

        expect(mockFraudFlagsRepo.create).not.toHaveBeenCalled();
        expect(mockFraudFlagsRepo.save).toHaveBeenCalledWith(
          expect.objectContaining({ id: 'existing-flag' }),
        );
      });
    });

    describe('counterparty concentration signal', () => {
      it('flags a user concentrated on a small clique of counterparties', async () => {
        mockPredictionsRepo.find.mockResolvedValue([]); // no timing signal

        const qb = mockPredictionsRepo.createQueryBuilder(
          'prediction',
        ) as unknown as {
          getRawMany: jest.Mock;
        };

        // First call: distinct markets the user participated in.
        // Second call: co-participants across those markets.
        qb.getRawMany
          .mockResolvedValueOnce([
            { marketId: 'm1' },
            { marketId: 'm2' },
            { marketId: 'm3' },
          ])
          .mockResolvedValueOnce([
            { counterpartyId: 'clique-user', marketId: 'm1' },
            { counterpartyId: 'clique-user', marketId: 'm2' },
            { counterpartyId: 'clique-user', marketId: 'm3' },
          ]);

        await service.evaluateFraudSignalsForUser('user-1');

        expect(mockFraudFlagsRepo.save).toHaveBeenCalledWith(
          expect.objectContaining({
            user_id: 'user-1',
            signal_type: FraudSignalType.COUNTERPARTY_CONCENTRATION,
            status: FraudFlagStatus.OPEN,
          }),
        );
      });

      it('does not flag a user with diverse counterparties', async () => {
        mockPredictionsRepo.find.mockResolvedValue([]);

        const qb = mockPredictionsRepo.createQueryBuilder(
          'prediction',
        ) as unknown as {
          getRawMany: jest.Mock;
        };

        qb.getRawMany
          .mockResolvedValueOnce([
            { marketId: 'm1' },
            { marketId: 'm2' },
            { marketId: 'm3' },
          ])
          .mockResolvedValueOnce([
            { counterpartyId: 'a', marketId: 'm1' },
            { counterpartyId: 'b', marketId: 'm2' },
            { counterpartyId: 'c', marketId: 'm3' },
          ]);

        await service.evaluateFraudSignalsForUser('user-1');

        expect(mockFraudFlagsRepo.save).not.toHaveBeenCalledWith(
          expect.objectContaining({
            signal_type: FraudSignalType.COUNTERPARTY_CONCENTRATION,
          }),
        );
      });

      it('does not evaluate below the minimum market sample size', async () => {
        mockPredictionsRepo.find.mockResolvedValue([]);

        const qb = mockPredictionsRepo.createQueryBuilder(
          'prediction',
        ) as unknown as {
          getRawMany: jest.Mock;
        };

        qb.getRawMany.mockResolvedValueOnce([{ marketId: 'm1' }]);

        await service.evaluateFraudSignalsForUser('user-1');

        expect(mockFraudFlagsRepo.save).not.toHaveBeenCalledWith(
          expect.objectContaining({
            signal_type: FraudSignalType.COUNTERPARTY_CONCENTRATION,
          }),
        );
      });
    });

    it('returns the created flags without throwing or banning the user', async () => {
      const base = Date.now();
      mockPredictionsRepo.find.mockResolvedValue([
        makePrediction(new Date(base)),
        makePrediction(new Date(base + 1_000)),
        makePrediction(new Date(base + 2_000)),
      ]);

      const result = await service.evaluateFraudSignalsForUser('user-1');

      expect(Array.isArray(result)).toBe(true);
      expect(result.every((flag) => flag.status === FraudFlagStatus.OPEN)).toBe(
        true,
      );
    });
  });

  describe('listFraudFlags', () => {
    it('returns a paginated list scoped by status, signal type, and user', async () => {
      const flags = [{ id: 'flag-1' } as PredictionFraudFlag];
      const qb = mockFraudFlagsRepo.createQueryBuilder('flag') as unknown as {
        andWhere: jest.Mock;
        getManyAndCount: jest.Mock;
      };
      qb.getManyAndCount.mockResolvedValue([flags, 1]);

      const result = await service.listFraudFlags({
        status: FraudFlagStatus.OPEN,
        signal_type: FraudSignalType.TIMING_CLUSTERING,
        user_id: 'user-1',
        page: 1,
        limit: 20,
      });

      expect(qb.andWhere).toHaveBeenCalledWith('flag.status = :status', {
        status: FraudFlagStatus.OPEN,
      });
      expect(qb.andWhere).toHaveBeenCalledWith(
        'flag.signal_type = :signalType',
        { signalType: FraudSignalType.TIMING_CLUSTERING },
      );
      expect(qb.andWhere).toHaveBeenCalledWith('flag.user_id = :userId', {
        userId: 'user-1',
      });
      expect(result).toEqual({
        data: flags,
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      });
    });
  });
});
