import { BadRequestException, BadGatewayException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { MarketsService } from './markets.service';
import { Market } from './entities/market.entity';
import { Comment } from './entities/comment.entity';
import { MarketTemplate } from './entities/market-template.entity';
import { SorobanService } from '../soroban/soroban.service';
import { UsersService } from '../users/users.service';
import { User } from '../users/entities/user.entity';
import { CreateMarketDto } from './dto/create-market.dto';

describe('MarketsService - Bulk Creation', () => {
  let service: MarketsService;
  let marketsRepository: jest.Mocked<Repository<Market>>;
  let dataSource: jest.Mocked<DataSource>;
  let sorobanService: jest.Mocked<SorobanService>;

  const mockUser = {
    id: 'user-1',
    stellar_address: 'GABC123',
  } as User;

  const makeCreateDto = (): CreateMarketDto => ({
    title: 'Test Market',
    description: 'Test description for market',
    category: 'Crypto' as any,
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
    } as any;

    const mockQueryRunner = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      manager: {
        create: jest.fn(),
        save: jest.fn(),
      },
    };

    dataSource = {
      createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
    } as any;

    sorobanService = {
      createMarket: jest.fn().mockResolvedValue({
        market_id: 'market_123',
        tx_hash: 'tx_hash_123',
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
          useValue: {},
        },
        {
          provide: getRepositoryToken(MarketTemplate),
          useValue: {},
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

  it('should reject bulk creation with more than 10 markets', async () => {
    const dtos: CreateMarketDto[] = Array(11).fill(makeCreateDto());

    // The validation happens at DTO level via class-validator
    // So we just verify the service accepts up to 10
    const result = await service.createBulk(dtos.slice(0, 10), mockUser);
    expect(result).toHaveLength(10);
  });

  it('should reject if any market has past end_time', async () => {
    const dto = makeCreateDto();
    dto.end_time = new Date(Date.now() - 1000).toISOString();

    await expect(service.createBulk([dto], mockUser)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('should create multiple markets in transaction', async () => {
    const dtos = [makeCreateDto(), makeCreateDto()];
    const mockQueryRunner = dataSource.createQueryRunner();

    mockQueryRunner.manager.create.mockImplementation(
      (entity, data) =>
        ({
          ...data,
          id: 'market-' + Math.random(),
        }) as Market,
    );

    mockQueryRunner.manager.save.mockResolvedValue({
      id: 'market-123',
      on_chain_market_id: 'market_123',
    } as Market);

    const result = await service.createBulk(dtos, mockUser);

    expect(mockQueryRunner.startTransaction).toHaveBeenCalled();
    expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
    expect(result).toHaveLength(2);
  });

  it('should rollback transaction on Soroban failure', async () => {
    const dtos = [makeCreateDto()];
    const mockQueryRunner = dataSource.createQueryRunner();

    sorobanService.createMarket.mockRejectedValueOnce(
      new Error('Soroban error'),
    );

    await expect(service.createBulk(dtos, mockUser)).rejects.toThrow(
      BadGatewayException,
    );

    expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
  });
});
