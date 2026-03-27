import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken, getDataSourceToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Repository, ObjectLiteral } from 'typeorm';
import { PredictionsService } from './predictions.service';
import { Prediction } from './entities/prediction.entity';
import { Market } from '../markets/entities/market.entity';
import { User } from '../users/entities/user.entity';
import { SorobanService } from '../soroban/soroban.service';

type MockRepo<T extends ObjectLiteral> = jest.Mocked<
  Pick<Repository<T>, 'findOne' | 'create' | 'save'>
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
  let mockSoroban: jest.Mocked<SorobanService>;

  beforeEach(async () => {
    const qbMock = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue(undefined),
    };

    mockPredictionsRepo = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };

    mockMarketsRepo = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };

    mockSoroban = {
      submitPrediction: jest.fn().mockResolvedValue({ tx_hash: 'abc123' }),
      claimPayout: jest.fn(),
      getEvents: jest.fn(),
    } as unknown as jest.Mocked<SorobanService>;

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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PredictionsService,
        {
          provide: getRepositoryToken(Prediction),
          useValue: mockPredictionsRepo,
        },
        { provide: getRepositoryToken(Market), useValue: mockMarketsRepo },
        { provide: getRepositoryToken(User), useValue: {} },
        { provide: SorobanService, useValue: mockSoroban },
        { provide: getDataSourceToken(), useValue: mockDataSource },
      ],
    }).compile();

    service = module.get<PredictionsService>(PredictionsService);
  });

  describe('submit', () => {
    it('returns prediction on happy path', async () => {
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

      // tx_hash 'abc123' in the result proves SorobanService.submitPrediction was called.
      expect(result).toMatchObject({
        tx_hash: 'abc123',
        chosen_outcome: 'Yes',
      });
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
      } as Prediction;

      mockPredictionsRepo.findOne.mockResolvedValue(prediction);
      mockPredictionsRepo.save = jest.fn().mockResolvedValue({
        ...prediction,
        payout_claimed: true,
        tx_hash: 'claim-tx',
      });
      mockSoroban.claimPayout.mockResolvedValue({ tx_hash: 'claim-tx' });

      const result = await service.claim('pred-1', user);

      expect(result.payout_claimed).toBe(true);
      expect(result.tx_hash).toBe('claim-tx');
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockSoroban.claimPayout).toHaveBeenCalledWith(
        user.stellar_address,
        market.on_chain_market_id,
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
});
