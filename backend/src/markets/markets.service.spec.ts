import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository, SelectQueryBuilder } from 'typeorm';
import { SorobanService } from '../soroban/soroban.service';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { CreateMarketDto } from './dto/create-market.dto';
import { UpdateMarketDto } from './dto/update-market.dto';
import { Comment } from './entities/comment.entity';
import { MarketTemplate } from './entities/market-template.entity';
import { Market } from './entities/market.entity';
import { UserBookmark } from './entities/user-bookmark.entity';
import { Prediction } from '../predictions/entities/prediction.entity';
import { MarketsService } from './markets.service';

type MockRepo = jest.Mocked<
  Pick<Repository<Market>, 'create' | 'save' | 'findOne' | 'find'>
>;

describe('MarketsService', () => {
  let service: MarketsService;
  let marketsRepository: MockRepo;
  let sorobanService: jest.Mocked<
    Pick<SorobanService, 'createMarket' | 'resolveMarket'>
  >;
  let dataSource: jest.Mocked<DataSource>;

  const mockUser = {
    id: 'user-1',
    stellar_address: 'GABC123',
  } as User;

  const makeCreateDto = (): CreateMarketDto => ({
    title: 'Will ETH hit $10k?',
    description: 'Simple market description for testing',
    category: 'Crypto' as CreateMarketDto['category'],
    outcome_options: ['YES', 'NO'],
    end_time: new Date(Date.now() + 60_000).toISOString(),
    resolution_time: new Date(Date.now() + 120_000).toISOString(),
    creator_fee_bps: 100,
    min_stake_stroops: '1000',
    max_stake_stroops: '1000000',
    is_public: true,
  });

  beforeEach(async () => {
    marketsRepository = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
    };

    sorobanService = {
      createMarket: jest.fn(),
      resolveMarket: jest.fn(),
    };

    dataSource = {
      createQueryRunner: jest.fn().mockReturnValue({
        connect: jest.fn(),
        startTransaction: jest.fn(),
        commitTransaction: jest.fn(),
        rollbackTransaction: jest.fn(),
        release: jest.fn(),
        manager: {
          create: jest.fn(),
          save: jest.fn(),
        },
      }),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MarketsService,
        {
          provide: getRepositoryToken(Market),
          useValue: marketsRepository,
        },
        {
          provide: getRepositoryToken(Comment),
          useValue: marketsRepository, // reuse marketsRepository mock structure
        },
        {
          provide: getRepositoryToken(MarketTemplate),
          useValue: marketsRepository,
        },
        {
          provide: getRepositoryToken(UserBookmark),
          useValue: {
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            delete: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Prediction),
          useValue: {
            find: jest.fn(),
          },
        },
        {
          provide: UsersService,
          useValue: {},
        },
        {
          provide: SorobanService,
          useValue: sorobanService,
        },
        {
          provide: DataSource,
          useValue: dataSource,
        },
      ],
    }).compile();

    service = module.get<MarketsService>(MarketsService);
  });

  it('createMarket() throws BadRequestException for past end_time', async () => {
    const dto = makeCreateDto();
    dto.end_time = new Date(Date.now() - 60_000).toISOString();

    await expect(service.createMarket(dto, mockUser)).rejects.toThrow(
      BadRequestException,
    );
    expect(sorobanService.createMarket).not.toHaveBeenCalled();
  });

  it('createMarket() saves market and returns it on Soroban success', async () => {
    const dto = makeCreateDto();

    sorobanService.createMarket.mockResolvedValue({
      market_id: 'market-on-chain-1',
      tx_hash: 'abc123',
    });

    const createdEntity = {
      on_chain_market_id: 'market-on-chain-1',
      title: dto.title,
    } as Market;

    const savedEntity = {
      ...createdEntity,
      id: 'market-db-1',
    } as Market;

    marketsRepository.create.mockReturnValue(createdEntity);
    marketsRepository.save.mockResolvedValue(savedEntity);

    const result = await service.createMarket(dto, mockUser);

    expect(sorobanService.createMarket).toHaveBeenCalled();
    expect(marketsRepository.create).toHaveBeenCalled();
    expect(marketsRepository.save).toHaveBeenCalledWith(createdEntity);
    expect(result).toEqual(savedEntity);
  });

  it('resolveMarket() throws ConflictException if already resolved', async () => {
    marketsRepository.findOne.mockResolvedValue({
      id: 'market-1',
      on_chain_market_id: 'on-chain-1',
      title: 'Resolved market',
      outcome_options: ['YES', 'NO'],
      is_resolved: true,
    } as Market);

    await expect(service.resolveMarket('market-1', 'YES')).rejects.toThrow(
      ConflictException,
    );
    expect(sorobanService.resolveMarket).not.toHaveBeenCalled();
  });

  it('resolveMarket() throws BadRequestException for invalid outcome', async () => {
    marketsRepository.findOne.mockResolvedValue({
      id: 'market-1',
      on_chain_market_id: 'on-chain-1',
      title: 'Unresolved market',
      outcome_options: ['YES', 'NO'],
      is_resolved: false,
    } as Market);

    await expect(service.resolveMarket('market-1', 'MAYBE')).rejects.toThrow(
      BadRequestException,
    );
    expect(sorobanService.resolveMarket).not.toHaveBeenCalled();
  });

  describe('getTrendingMarkets', () => {
    it('should return trending markets sorted by trending score', async () => {
      const now = new Date();
      const markets = [
        {
          id: 'market-1',
          title: 'Low activity market',
          description: 'desc',
          category: 'Crypto',
          outcome_options: ['Yes', 'No'],
          end_time: new Date(now.getTime() + 48 * 60 * 60 * 1000),
          is_resolved: false,
          is_cancelled: false,
          participant_count: 2,
          total_pool_stroops: '1000000',
          created_at: now,
        },
        {
          id: 'market-2',
          title: 'High activity market',
          description: 'desc',
          category: 'Sports',
          outcome_options: ['Team A', 'Team B'],
          end_time: new Date(now.getTime() + 12 * 60 * 60 * 1000),
          is_resolved: false,
          is_cancelled: false,
          participant_count: 50,
          total_pool_stroops: '50000000',
          created_at: now,
        },
      ] as Market[];

      marketsRepository.find.mockResolvedValue(markets);

      const result = await service.getTrendingMarkets({ page: 1, limit: 20 });

      expect(result.data.length).toBe(2);
      expect(result.data[0].id).toBe('market-2');
      expect(result.data[0].trending_score).toBeGreaterThan(
        result.data[1].trending_score,
      );
      expect(result.total).toBe(2);
    });

    it('should support pagination', async () => {
      const now = new Date();
      const markets = Array.from({ length: 5 }, (_, i) => ({
        id: `market-${i}`,
        title: `Market ${i}`,
        description: 'desc',
        category: 'Crypto',
        outcome_options: ['Yes', 'No'],
        end_time: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        is_resolved: false,
        is_cancelled: false,
        participant_count: i * 10,
        total_pool_stroops: String(i * 10000000),
        created_at: now,
      })) as Market[];

      marketsRepository.find.mockResolvedValue(markets);

      const result = await service.getTrendingMarkets({ page: 1, limit: 2 });

      expect(result.data.length).toBe(2);
      expect(result.total).toBe(5);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(2);
    });

    it('should use cached results within TTL', async () => {
      marketsRepository.find.mockResolvedValue([]);

      await service.getTrendingMarkets({ page: 1, limit: 20 });
      await service.getTrendingMarkets({ page: 1, limit: 20 });

      // find should only be called once due to caching
      expect(marketsRepository.find).toHaveBeenCalledTimes(1);
    });
  });
});

describe('MarketsService.findFeaturedMarkets', () => {
  let service: MarketsService;
  let marketsRepository: jest.Mocked<Repository<Market>>;

  const makeFeaturedMarket = (overrides: Partial<Market> = {}): Market =>
    ({
      id: `market-${Math.random()}`,
      on_chain_market_id: `on-chain-${Math.random()}`,
      title: 'Featured Market',
      is_featured: true,
      featured_at: new Date(),
      is_public: true,
      is_cancelled: false,
      ...overrides,
    }) as Market;

  beforeEach(async () => {
    marketsRepository = {
      createQueryBuilder: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MarketsService,
        { provide: getRepositoryToken(Market), useValue: marketsRepository },
        { provide: getRepositoryToken(Comment), useValue: {} },
        { provide: getRepositoryToken(MarketTemplate), useValue: {} },
        { provide: getRepositoryToken(UserBookmark), useValue: {} },
        { provide: getRepositoryToken(Prediction), useValue: {} },
        { provide: getRepositoryToken(User), useValue: {} },
        { provide: UsersService, useValue: {} },
        { provide: SorobanService, useValue: {} },
        { provide: DataSource, useValue: {} },
      ],
    }).compile();

    service = module.get<MarketsService>(MarketsService);
  });

  it('returns featured markets with correct filters', async () => {
    const mockQueryBuilder = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn(),
    };

    marketsRepository.createQueryBuilder.mockReturnValue(
      mockQueryBuilder as unknown as SelectQueryBuilder<Market>,
    );

    const featuredMarkets = [makeFeaturedMarket(), makeFeaturedMarket()];
    mockQueryBuilder.getManyAndCount.mockResolvedValue([featuredMarkets, 2]);

    const result = await service.findFeaturedMarkets(1, 20);

    expect(marketsRepository.createQueryBuilder).toHaveBeenCalledWith('market');
    expect(mockQueryBuilder.leftJoinAndSelect).toHaveBeenCalledWith(
      'market.creator',
      'creator',
    );
    expect(mockQueryBuilder.where).toHaveBeenCalledWith(
      'market.is_featured = true',
    );
    expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
      'market.is_public = true',
    );
    expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
      'market.is_cancelled = false',
    );
    expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith(
      'market.featured_at',
      'DESC',
    );
    expect(mockQueryBuilder.skip).toHaveBeenCalledWith(0);
    expect(mockQueryBuilder.take).toHaveBeenCalledWith(20);
    expect(result).toEqual({
      data: featuredMarkets,
      total: 2,
      page: 1,
      limit: 20,
    });
  });

  it('handles pagination correctly', async () => {
    const mockQueryBuilder = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn(),
    };

    marketsRepository.createQueryBuilder.mockReturnValue(
      mockQueryBuilder as unknown as SelectQueryBuilder<Market>,
    );
    mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

    await service.findFeaturedMarkets(2, 10);

    expect(mockQueryBuilder.skip).toHaveBeenCalledWith(10);
    expect(mockQueryBuilder.take).toHaveBeenCalledWith(10);
  });
});

describe('MarketsService.update', () => {
  let service: MarketsService;
  let marketsRepository: MockRepo;

  const mockCreator = {
    id: 'creator-1',
    stellar_address: 'GABC123',
  } as User;

  const mockOtherUser = {
    id: 'user-2',
    stellar_address: 'GDEF456',
  } as User;

  const makeMarket = (overrides: Partial<Market> = {}): Market =>
    ({
      id: 'market-1',
      on_chain_market_id: 'on-chain-1',
      title: 'Original Title',
      description: 'Original description',
      category: 'Crypto',
      outcome_options: ['YES', 'NO'],
      end_time: new Date(Date.now() + 60_000),
      resolution_time: new Date(Date.now() + 120_000),
      is_resolved: false,
      is_cancelled: false,
      creator: mockCreator,
      ...overrides,
    }) as Market;

  beforeEach(async () => {
    marketsRepository = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MarketsService,
        {
          provide: getRepositoryToken(Market),
          useValue: marketsRepository,
        },
        {
          provide: getRepositoryToken(Comment),
          useValue: marketsRepository,
        },
        {
          provide: getRepositoryToken(MarketTemplate),
          useValue: marketsRepository,
        },
        {
          provide: getRepositoryToken(UserBookmark),
          useValue: {
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            delete: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Prediction),
          useValue: {
            find: jest.fn(),
          },
        },
        {
          provide: UsersService,
          useValue: {},
        },
        {
          provide: SorobanService,
          useValue: {},
        },
        {
          provide: DataSource,
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<MarketsService>(MarketsService);
  });

  it('should update market when caller is creator', async () => {
    const market = makeMarket();
    const dto: UpdateMarketDto = {
      title: 'Updated Title',
      description: 'Updated description',
    };

    marketsRepository.findOne.mockResolvedValue(market);
    marketsRepository.save.mockResolvedValue({
      ...market,
      ...dto,
    });

    const result = await service.update('market-1', mockCreator.id, dto);

    expect(marketsRepository.findOne).toHaveBeenCalledWith({
      where: [{ id: 'market-1' }, { on_chain_market_id: 'market-1' }],
      relations: ['creator'],
    });
    expect(marketsRepository.save).toHaveBeenCalled();
    expect(result.title).toBe('Updated Title');
    expect(result.description).toBe('Updated description');
  });

  it('should throw ForbiddenException when caller is not creator', async () => {
    const market = makeMarket();
    const dto: UpdateMarketDto = { title: 'Updated Title' };

    marketsRepository.findOne.mockResolvedValue(market);

    await expect(
      service.update('market-1', mockOtherUser.id, dto),
    ).rejects.toThrow(ForbiddenException);
    expect(marketsRepository.save).not.toHaveBeenCalled();
  });

  it('should throw BadRequestException when market has ended', async () => {
    const market = makeMarket({
      end_time: new Date(Date.now() - 60_000), // ended 1 minute ago
    });
    const dto: UpdateMarketDto = { title: 'Updated Title' };

    marketsRepository.findOne.mockResolvedValue(market);

    await expect(
      service.update('market-1', mockCreator.id, dto),
    ).rejects.toThrow(BadRequestException);
    expect(marketsRepository.save).not.toHaveBeenCalled();
  });

  it('should update only provided fields', async () => {
    const market = makeMarket();
    const dto: UpdateMarketDto = { title: 'New Title' };

    marketsRepository.findOne.mockResolvedValue(market);
    marketsRepository.save.mockResolvedValue({
      ...market,
      title: 'New Title',
    });

    const result = await service.update('market-1', mockCreator.id, dto);

    expect(result.title).toBe('New Title');
    expect(result.description).toBe('Original description');
    expect(result.category).toBe('Crypto');
  });

  it('should update category when provided', async () => {
    const market = makeMarket();
    const dto: UpdateMarketDto = { category: 'Sports' as any };

    marketsRepository.findOne.mockResolvedValue(market);
    marketsRepository.save.mockResolvedValue({
      ...market,
      category: 'Sports',
    });

    const result = await service.update('market-1', mockCreator.id, dto);

    expect(result.category).toBe('Sports');
  });
});

describe('MarketsService.getPredictionStats', () => {
  let service: MarketsService;
  let marketsRepository: MockRepo;
  let predictionsRepository: jest.Mocked<Pick<Repository<Prediction>, 'find'>>;

  const mockMarket = {
    id: 'market-1',
    on_chain_market_id: 'on-chain-1',
    title: 'Test Market',
    outcome_options: ['Yes', 'No'],
    creator: { id: 'creator-1' } as User,
  } as Market;

  beforeEach(async () => {
    marketsRepository = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
    };

    predictionsRepository = {
      find: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MarketsService,
        {
          provide: getRepositoryToken(Market),
          useValue: marketsRepository,
        },
        {
          provide: getRepositoryToken(Comment),
          useValue: marketsRepository,
        },
        {
          provide: getRepositoryToken(MarketTemplate),
          useValue: marketsRepository,
        },
        {
          provide: getRepositoryToken(UserBookmark),
          useValue: {
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            delete: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Prediction),
          useValue: predictionsRepository,
        },
        {
          provide: UsersService,
          useValue: {},
        },
        {
          provide: SorobanService,
          useValue: {},
        },
        {
          provide: DataSource,
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<MarketsService>(MarketsService);
  });

  it('should return real prediction statistics from database', async () => {
    marketsRepository.findOne.mockResolvedValue(mockMarket);

    const predictions = [
      {
        chosen_outcome: 'Yes',
        stake_amount_stroops: '10000000',
      },
      {
        chosen_outcome: 'Yes',
        stake_amount_stroops: '5000000',
      },
      {
        chosen_outcome: 'No',
        stake_amount_stroops: '8000000',
      },
    ] as Prediction[];

    predictionsRepository.find.mockResolvedValue(predictions);

    const result = await service.getPredictionStats('market-1');

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      outcome: 'Yes',
      count: 2,
      total_staked_stroops: '15000000',
    });
    expect(result[1]).toMatchObject({
      outcome: 'No',
      count: 1,
      total_staked_stroops: '8000000',
    });
  });

  it('should return zero counts for outcomes with no predictions', async () => {
    marketsRepository.findOne.mockResolvedValue(mockMarket);
    predictionsRepository.find.mockResolvedValue([]);

    const result = await service.getPredictionStats('market-1');

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      outcome: 'Yes',
      count: 0,
      total_staked_stroops: '0',
    });
    expect(result[1]).toMatchObject({
      outcome: 'No',
      count: 0,
      total_staked_stroops: '0',
    });
  });

  it('should cache results for 5 minutes', async () => {
    marketsRepository.findOne.mockResolvedValue(mockMarket);
    predictionsRepository.find.mockResolvedValue([]);

    // First call
    await service.getPredictionStats('market-1');
    expect(predictionsRepository.find).toHaveBeenCalledTimes(1);

    // Second call should use cache
    await service.getPredictionStats('market-1');
    expect(predictionsRepository.find).toHaveBeenCalledTimes(1);
  });

  it('should throw NotFoundException if market does not exist', async () => {
    marketsRepository.findOne.mockResolvedValue(null);

    await expect(service.getPredictionStats('non-existent')).rejects.toThrow(
      'Market with ID "non-existent" not found',
    );
  });
});

describe('MarketsService.cancelMarket', () => {
  let service: MarketsService;
  let marketsRepository: MockRepo;
  let sorobanService: jest.Mocked<Pick<SorobanService, 'cancelMarket'>>;

  const mockCreator = { id: 'creator-1', role: 'user' } as User;
  const mockAdmin = { id: 'admin-1', role: 'admin' } as User;
  const mockOther = { id: 'other-1', role: 'user' } as User;

  const makeMarket = (overrides: Partial<Market> = {}): Market =>
    ({
      id: 'market-1',
      on_chain_market_id: 'on-chain-1',
      title: 'Test Market',
      outcome_options: ['YES', 'NO'],
      end_time: new Date(Date.now() + 60_000),
      is_resolved: false,
      is_cancelled: false,
      creator: mockCreator,
      ...overrides,
    }) as Market;

  beforeEach(async () => {
    marketsRepository = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
    };

    sorobanService = { cancelMarket: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MarketsService,
        { provide: getRepositoryToken(Market), useValue: marketsRepository },
        { provide: getRepositoryToken(Comment), useValue: {} },
        { provide: getRepositoryToken(MarketTemplate), useValue: {} },
        { provide: getRepositoryToken(UserBookmark), useValue: {} },
        { provide: getRepositoryToken(Prediction), useValue: {} },
        { provide: UsersService, useValue: {} },
        { provide: SorobanService, useValue: sorobanService },
        { provide: DataSource, useValue: {} },
      ],
    }).compile();

    service = module.get<MarketsService>(MarketsService);
  });

  it('throws ForbiddenException when caller is not creator or admin', async () => {
    marketsRepository.findOne.mockResolvedValue(makeMarket());

    await expect(service.cancelMarket('market-1', mockOther)).rejects.toThrow(
      ForbiddenException,
    );
    expect(sorobanService.cancelMarket).not.toHaveBeenCalled();
  });

  it('throws BadRequestException when market is already resolved', async () => {
    marketsRepository.findOne.mockResolvedValue(
      makeMarket({ is_resolved: true }),
    );

    await expect(service.cancelMarket('market-1', mockCreator)).rejects.toThrow(
      BadRequestException,
    );
    expect(sorobanService.cancelMarket).not.toHaveBeenCalled();
  });

  it('throws BadRequestException when market is already cancelled', async () => {
    marketsRepository.findOne.mockResolvedValue(
      makeMarket({ is_cancelled: true }),
    );

    await expect(service.cancelMarket('market-1', mockCreator)).rejects.toThrow(
      BadRequestException,
    );
    expect(sorobanService.cancelMarket).not.toHaveBeenCalled();
  });

  it('throws BadRequestException when end_time has passed', async () => {
    marketsRepository.findOne.mockResolvedValue(
      makeMarket({ end_time: new Date(Date.now() - 60_000) }),
    );

    await expect(service.cancelMarket('market-1', mockCreator)).rejects.toThrow(
      BadRequestException,
    );
    expect(sorobanService.cancelMarket).not.toHaveBeenCalled();
  });

  it('allows creator to cancel their own market', async () => {
    const market = makeMarket();
    marketsRepository.findOne.mockResolvedValue(market);
    sorobanService.cancelMarket.mockResolvedValue({ tx_hash: 'abc' });
    marketsRepository.save.mockResolvedValue({ ...market, is_cancelled: true });

    const result = await service.cancelMarket('market-1', mockCreator);

    expect(sorobanService.cancelMarket).toHaveBeenCalledWith('on-chain-1');
    expect(marketsRepository.save).toHaveBeenCalled();
    expect(result.is_cancelled).toBe(true);
  });

  it('allows admin to cancel any market', async () => {
    const market = makeMarket({ creator: mockOther });
    marketsRepository.findOne.mockResolvedValue(market);
    sorobanService.cancelMarket.mockResolvedValue({ tx_hash: 'def' });
    marketsRepository.save.mockResolvedValue({ ...market, is_cancelled: true });

    const result = await service.cancelMarket('market-1', mockAdmin);

    expect(sorobanService.cancelMarket).toHaveBeenCalledWith('on-chain-1');
    expect(result.is_cancelled).toBe(true);
  });

  it('throws BadGatewayException when Soroban call fails', async () => {
    marketsRepository.findOne.mockResolvedValue(makeMarket());
    sorobanService.cancelMarket.mockRejectedValue(new Error('RPC down'));

    await expect(service.cancelMarket('market-1', mockCreator)).rejects.toThrow(
      'Failed to cancel market on Soroban',
    );
    expect(marketsRepository.save).not.toHaveBeenCalled();
  });
});
