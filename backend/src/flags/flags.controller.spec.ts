import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { FlagsController } from './flags.controller';
import { FlagsService } from './flags.service';
import { Flag, FlagStatus, FlagReason } from './entities/flag.entity';
import { CreateFlagDto } from './dto/create-flag.dto';
import { ListFlagsQueryDto } from './dto/list-flags-query.dto';
import { User } from '../users/entities/user.entity';

describe('FlagsController', () => {
  let controller: FlagsController;
  let flagsService: FlagsService;

  const mockFlag: Flag = {
    id: 'flag-1',
    market_id: 'market-1',
    user_id: 'user-1',
    reason: FlagReason.INAPPROPRIATE_CONTENT,
    status: FlagStatus.PENDING,
    description: 'This is inappropriate',
    resolution_action: null,
    admin_notes: null,
    resolved_by: null,
    resolved_by_user: null,
    resolved_at: null,
    created_at: new Date(),
    market: null as any,
    user: null as any,
  };

  const mockUser: User = {
    id: 'user-1',
    stellar_address: 'GABC123',
    username: 'testuser',
    total_predictions: 0,
    correct_predictions: 0,
    reputation_score: 0,
    total_winnings_stroops: BigInt(0),
    total_staked_stroops: BigInt(0),
    is_banned: false,
    created_at: new Date(),
    updated_at: new Date(),
  } as User;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FlagsController],
      providers: [
        {
          provide: FlagsService,
          useValue: {
            createFlag: jest.fn(),
            listFlags: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<FlagsController>(FlagsController);
    flagsService = module.get<FlagsService>(FlagsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('createFlag', () => {
    it('should create a flag successfully', async () => {
      const createFlagDto: CreateFlagDto = {
        market_id: 'market-1',
        reason: FlagReason.INAPPROPRIATE_CONTENT,
        description: 'This is inappropriate',
      };

      jest.spyOn(flagsService, 'createFlag').mockResolvedValue(mockFlag);

      const result = await controller.createFlag(createFlagDto, mockUser);

      expect(flagsService.createFlag).toHaveBeenCalledWith(
        'user-1',
        createFlagDto,
      );
      expect(result).toEqual(mockFlag);
    });

    it('should throw NotFoundException when market does not exist', async () => {
      const createFlagDto: CreateFlagDto = {
        market_id: 'nonexistent-market',
        reason: FlagReason.INAPPROPRIATE_CONTENT,
        description: 'This is inappropriate',
      };

      jest
        .spyOn(flagsService, 'createFlag')
        .mockRejectedValue(new Error('Market not found'));

      await expect(
        controller.createFlag(createFlagDto, mockUser),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException when user already flagged the market', async () => {
      const createFlagDto: CreateFlagDto = {
        market_id: 'market-1',
        reason: FlagReason.INAPPROPRIATE_CONTENT,
        description: 'This is inappropriate',
      };

      jest
        .spyOn(flagsService, 'createFlag')
        .mockRejectedValue(new Error('You have already flagged this market'));

      await expect(
        controller.createFlag(createFlagDto, mockUser),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('getMyFlags', () => {
    it('should return user flags with pagination', async () => {
      const query: ListFlagsQueryDto = {
        page: '1',
        limit: '10',
      };

      const mockResponse = {
        data: [mockFlag],
        meta: {
          total: 1,
          page: 1,
          limit: 10,
          totalPages: 1,
        },
      };

      jest.spyOn(flagsService, 'listFlags').mockResolvedValue(mockResponse);

      const result = await controller.getMyFlags(mockUser, query);

      expect(flagsService.listFlags).toHaveBeenCalledWith({
        ...query,
        user_id: 'user-1',
      });
      expect(result).toEqual(mockResponse);
    });

    it('should return empty list when user has no flags', async () => {
      const query: ListFlagsQueryDto = {
        page: '1',
        limit: '10',
      };

      const mockResponse = {
        data: [],
        meta: {
          total: 0,
          page: 1,
          limit: 10,
          totalPages: 0,
        },
      };

      jest.spyOn(flagsService, 'listFlags').mockResolvedValue(mockResponse);

      const result = await controller.getMyFlags(mockUser, query);

      expect(result.data).toHaveLength(0);
      expect(result.meta.total).toBe(0);
    });
  });
});
