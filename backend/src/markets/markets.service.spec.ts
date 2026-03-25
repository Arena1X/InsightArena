import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, BadGatewayException } from '@nestjs/common';
import { MarketsService } from './markets.service';
import { Market } from './entities/market.entity';
import { UsersService } from '../users/users.service';
import { SorobanService } from '../soroban/soroban.service';
import { CreateMarketDto } from './dto/create-market.dto';

describe('MarketsService', () => {
  let service: MarketsService;
  let mockRepo: Record<string, jest.Mock>;
  let mockSoroban: Record<string, jest.Mock>;

  const mockUser = {
    id: 'user-uuid',
    stellar_address: 'GABCDEF',
    username: 'tester',
    role: 'user',
  } as any;

  const futureDate = new Date(Date.now() + 86_400_000).toISOString();
  const futureResolution = new Date(Date.now() + 172_800_000).toISOString();

  const validDto: CreateMarketDto = {
    title: 'Will it rain?',
    description: 'Resolves YES if it rains tomorrow',
    category: 'weather',
    outcome_options: ['yes', 'no'],
    end_time: futureDate,
    resolution_time: futureResolution,
  };

  beforeEach(async () => {
    mockRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn((data) => ({ id: 'market-uuid', ...data })),
      save: jest.fn((market) => Promise.resolve(market)),
    };

    mockSoroban = {
      createMarket: jest.fn().mockResolvedValue({
        onChainMarketId: '12345',
        txHash: 'tx_abc',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MarketsService,
        { provide: getRepositoryToken(Market), useValue: mockRepo },
        { provide: UsersService, useValue: {} },
        { provide: SorobanService, useValue: mockSoroban },
      ],
    }).compile();

    service = module.get<MarketsService>(MarketsService);
  });

  it('creates a market on-chain and saves to DB', async () => {
    const result = await service.createMarket(validDto, mockUser);

    expect(mockSoroban.createMarket).toHaveBeenCalledTimes(1);
    expect(mockRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        on_chain_market_id: '12345',
        title: 'Will it rain?',
        category: 'weather',
      }),
    );
    expect(mockRepo.save).toHaveBeenCalledTimes(1);
    expect(result.on_chain_market_id).toBe('12345');
  });

  it('rejects end_time in the past with 400', async () => {
    const pastDto = {
      ...validDto,
      end_time: new Date(Date.now() - 86_400_000).toISOString(),
    };

    await expect(service.createMarket(pastDto, mockUser)).rejects.toThrow(
      BadRequestException,
    );
    expect(mockSoroban.createMarket).not.toHaveBeenCalled();
  });

  it('rejects resolution_time before end_time with 400', async () => {
    const badDto = {
      ...validDto,
      resolution_time: validDto.end_time, // same as end_time, not after
    };

    await expect(service.createMarket(badDto, mockUser)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('returns 502 when Soroban call fails', async () => {
    mockSoroban.createMarket.mockRejectedValue(new Error('RPC timeout'));

    await expect(service.createMarket(validDto, mockUser)).rejects.toThrow(
      BadGatewayException,
    );
    expect(mockRepo.save).not.toHaveBeenCalled();
  });

  it('passes creator_fee_bps and stake limits to Soroban', async () => {
    const dtoWithFees = {
      ...validDto,
      creator_fee_bps: 200,
      min_stake: 5_000_000,
      max_stake: 50_000_000,
    };

    await service.createMarket(dtoWithFees, mockUser);

    expect(mockSoroban.createMarket).toHaveBeenCalledWith(
      expect.objectContaining({
        creatorFeeBps: 200,
        minStake: 5_000_000,
        maxStake: 50_000_000,
      }),
    );
  });

  it('uses default values when optional fields are omitted', async () => {
    await service.createMarket(validDto, mockUser);

    expect(mockSoroban.createMarket).toHaveBeenCalledWith(
      expect.objectContaining({
        creatorFeeBps: 0,
        minStake: 10_000_000,
        maxStake: 100_000_000,
        isPublic: true,
      }),
    );
  });
});
