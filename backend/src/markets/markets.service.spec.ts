import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { SorobanService } from '../soroban/soroban.service';
import { UsersService } from '../users/users.service';
import { User } from '../users/entities/user.entity';
import { Market } from './entities/market.entity';
import { Comment } from './entities/comment.entity';
import { MarketTemplate } from './entities/market-template.entity';
import { CreateMarketDto } from './dto/create-market.dto';
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
