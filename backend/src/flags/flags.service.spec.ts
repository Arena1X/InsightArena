import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder, UpdateResult } from 'typeorm';
import { AnalyticsService } from '../analytics/analytics.service';
import { Market } from '../markets/entities/market.entity';
import { User } from '../users/entities/user.entity';
import {
  Flag,
  FlagReason,
  FlagResolutionAction,
  FlagStatus,
} from './entities/flag.entity';
import { FlagsService } from './flags.service';

describe('FlagsService', () => {
  let service: FlagsService;
  let flagsRepository: Repository<Flag>;
  let usersRepository: Repository<User>;
  let marketsRepository: Repository<Market>;
  let analyticsService: AnalyticsService;

  const mockUser: User = {
    id: 'user-1',
    stellar_address: 'test@example.com',
    username: 'testuser',
    avatar_url: null,
    total_predictions: 0,
    correct_predictions: 0,
    total_staked_stroops: '0',
    total_winnings_stroops: '0',
    reputation_score: 0,
    season_points: 0,
    role: 'user',
    is_banned: false,
    ban_reason: null,
    banned_at: null,
    banned_by: null,
    created_at: new Date(),
    updated_at: new Date(),
  };

  const mockMarket: Market = {
    id: 'market-1',
    on_chain_market_id: 'chain-market-1',
    creator: mockUser,
    title: 'Test Market',
    description: 'Test Description',
    category: 'test',
    outcome_options: ['yes', 'no'],
    end_time: new Date(),
    resolution_time: new Date(),
    is_resolved: false,
    resolved_outcome: null,
    is_public: true,
    is_cancelled: false,
    total_pool_stroops: '1000',
    participant_count: 0,
    created_at: new Date(),
  };

  const createMockFlag = (): Flag => ({
    id: 'flag-1',
    market: mockMarket,
    market_id: 'market-1',
    user: mockUser,
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
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FlagsService,
        {
          provide: getRepositoryToken(Flag),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(User),
          useValue: {
            update: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Market),
          useValue: {
            findOne: jest.fn(),
            update: jest.fn(),
          },
        },
        {
          provide: AnalyticsService,
          useValue: {
            logActivity: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<FlagsService>(FlagsService);
    flagsRepository = module.get<Repository<Flag>>(getRepositoryToken(Flag));
    usersRepository = module.get<Repository<User>>(getRepositoryToken(User));
    marketsRepository = module.get<Repository<Market>>(
      getRepositoryToken(Market),
    );
    analyticsService = module.get<AnalyticsService>(AnalyticsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createFlag', () => {
    it('should create a flag successfully', async () => {
      const createFlagDto = {
        market_id: 'market-1',
        reason: FlagReason.INAPPROPRIATE_CONTENT,
        description: 'This is inappropriate',
      };

      jest.spyOn(marketsRepository, 'findOne').mockResolvedValue(mockMarket);
      jest.spyOn(flagsRepository, 'findOne').mockResolvedValue(null);
      jest.spyOn(flagsRepository, 'create').mockReturnValue(createMockFlag());
      jest.spyOn(flagsRepository, 'save').mockResolvedValue(createMockFlag());

      const result = await service.createFlag('user-1', createFlagDto);

      expect(result).toEqual(
        expect.objectContaining({
          id: 'flag-1',
          market_id: 'market-1',
          user_id: 'user-1',
          reason: FlagReason.INAPPROPRIATE_CONTENT,
          description: 'This is inappropriate',
          status: FlagStatus.PENDING,
        }),
      );
      expect(marketsRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'market-1' },
      });
      expect(flagsRepository.create).toHaveBeenCalledWith({
        ...createFlagDto,
        user_id: 'user-1',
      });
      expect(flagsRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          market_id: 'market-1',
          user_id: 'user-1',
          reason: FlagReason.INAPPROPRIATE_CONTENT,
          description: 'This is inappropriate',
          status: FlagStatus.PENDING,
        }),
      );
      expect(analyticsService.logActivity).toHaveBeenCalledWith(
        'user-1',
        'MARKET_FLAGGED',
        {
          market_id: 'market-1',
          reason: FlagReason.INAPPROPRIATE_CONTENT,
        },
      );
    });

    it('should throw NotFoundException if market does not exist', async () => {
      const createFlagDto = {
        market_id: 'non-existent-market',
        reason: FlagReason.INAPPROPRIATE_CONTENT,
      };

      jest.spyOn(marketsRepository, 'findOne').mockResolvedValue(null);

      await expect(service.createFlag('user-1', createFlagDto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException if user already flagged the market', async () => {
      const createFlagDto = {
        market_id: 'market-1',
        reason: FlagReason.INAPPROPRIATE_CONTENT,
      };

      jest.spyOn(marketsRepository, 'findOne').mockResolvedValue(mockMarket);
      jest
        .spyOn(flagsRepository, 'findOne')
        .mockResolvedValue(createMockFlag());

      await expect(service.createFlag('user-1', createFlagDto)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('listFlags', () => {
    it('should list flags with filters', async () => {
      const query = {
        page: '1',
        limit: '10',
        status: FlagStatus.PENDING,
        reason: FlagReason.INAPPROPRIATE_CONTENT,
      };

      const mockFlag = createMockFlag();
      const mockQueryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[mockFlag], 1]),
      };

      jest
        .spyOn(flagsRepository, 'createQueryBuilder')
        .mockReturnValue(mockQueryBuilder as unknown as SelectQueryBuilder<Flag>);

      const result = await service.listFlags(query);

      expect(result).toEqual({
        data: [mockFlag],
        meta: {
          total: 1,
          page: 1,
          limit: 10,
          totalPages: 1,
        },
      });
    });
  });

  describe('resolveFlag', () => {
    it('should resolve a flag with dismiss action', async () => {
      const resolveFlagDto = {
        action: FlagResolutionAction.DISMISS,
        admin_notes: 'No action needed',
      };

      jest
        .spyOn(flagsRepository, 'findOne')
        .mockResolvedValue(createMockFlag());
      jest.spyOn(flagsRepository, 'save').mockResolvedValue({
        ...createMockFlag(),
        status: FlagStatus.DISMISSED,
        resolution_action: FlagResolutionAction.DISMISS,
        admin_notes: 'No action needed',
        resolved_by: 'admin-1',
        resolved_at: new Date(),
      });

      const result = await service.resolveFlag(
        'flag-1',
        resolveFlagDto,
        'admin-1',
      );

      expect(result.status).toBe(FlagStatus.DISMISSED);
      expect(result.resolution_action).toBe(FlagResolutionAction.DISMISS);
      expect(result.resolved_by).toBe('admin-1');
      expect(analyticsService.logActivity).toHaveBeenCalledWith(
        'admin-1',
        'FLAG_RESOLVED',
        {
          flag_id: 'flag-1',
          action: FlagResolutionAction.DISMISS,
          market_id: 'market-1',
          user_id: 'user-1',
        },
      );
    });

    it('should resolve a flag with remove market action', async () => {
      const resolveFlagDto = {
        action: FlagResolutionAction.REMOVE_MARKET,
        admin_notes: 'Market removed',
      };

      jest
        .spyOn(flagsRepository, 'findOne')
        .mockResolvedValue(createMockFlag());
      jest.spyOn(marketsRepository, 'update').mockResolvedValue({} as unknown as UpdateResult);
      jest.spyOn(flagsRepository, 'save').mockResolvedValue({
        ...createMockFlag(),
        status: FlagStatus.RESOLVED,
        resolution_action: FlagResolutionAction.REMOVE_MARKET,
        admin_notes: 'Market removed',
        resolved_by: 'admin-1',
        resolved_at: new Date(),
      });

      const result = await service.resolveFlag(
        'flag-1',
        resolveFlagDto,
        'admin-1',
      );

      expect(marketsRepository.update).toHaveBeenCalledWith('market-1', {
        is_cancelled: true,
      });
      expect(result.resolution_action).toBe(FlagResolutionAction.REMOVE_MARKET);
    });

    it('should resolve a flag with ban user action', async () => {
      const resolveFlagDto = {
        action: FlagResolutionAction.BAN_USER,
        admin_notes: 'User banned',
      };

      jest
        .spyOn(flagsRepository, 'findOne')
        .mockResolvedValue(createMockFlag());
      jest.spyOn(usersRepository, 'update').mockResolvedValue({} as unknown as UpdateResult);
      jest.spyOn(flagsRepository, 'save').mockResolvedValue({
        ...createMockFlag(),
        status: FlagStatus.RESOLVED,
        resolution_action: FlagResolutionAction.BAN_USER,
        admin_notes: 'User banned',
        resolved_by: 'admin-1',
        resolved_at: new Date(),
      });

      const result = await service.resolveFlag(
        'flag-1',
        resolveFlagDto,
        'admin-1',
      );

      expect(usersRepository.update).toHaveBeenCalledWith('user-1', {
        is_banned: true,
        ban_reason: 'Banned due to flagged content: inappropriate_content',
        banned_at: expect.any(Date),
        banned_by: 'admin-1',
      });
      expect(result.resolution_action).toBe(FlagResolutionAction.BAN_USER);
    });

    it('should throw NotFoundException if flag does not exist', async () => {
      const resolveFlagDto = {
        action: FlagResolutionAction.DISMISS,
      };

      jest.spyOn(flagsRepository, 'findOne').mockResolvedValue(null);

      await expect(
        service.resolveFlag('non-existent-flag', resolveFlagDto, 'admin-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if flag is already resolved', async () => {
      const resolveFlagDto = {
        action: FlagResolutionAction.DISMISS,
      };

      const resolvedFlag = { ...createMockFlag(), status: FlagStatus.RESOLVED };

      jest.spyOn(flagsRepository, 'findOne').mockResolvedValue(resolvedFlag);

      await expect(
        service.resolveFlag('flag-1', resolveFlagDto, 'admin-1'),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
