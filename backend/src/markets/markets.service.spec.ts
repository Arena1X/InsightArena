import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SorobanService } from '../soroban/soroban.service';
import { UsersService } from '../users/users.service';
import { User } from '../users/entities/user.entity';
import { Market } from './entities/market.entity';
import { CreateMarketDto } from './dto/create-market.dto';
import { MarketsService } from './markets.service';

type MockRepo = jest.Mocked<
  Pick<Repository<Market>, 'create' | 'save' | 'findOne'>
>;

describe('MarketsService', () => {
  let service: MarketsService;
  let marketsRepository: MockRepo;
  let sorobanService: jest.Mocked<
    Pick<SorobanService, 'createMarket' | 'resolveMarket'>
  >;

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
    };

    sorobanService = {
      createMarket: jest.fn(),
      resolveMarket: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MarketsService,
        {
          provide: getRepositoryToken(Market),
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
});
