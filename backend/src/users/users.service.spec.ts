import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';
import { Prediction } from '../predictions/entities/prediction.entity';
import { Market } from '../markets/entities/market.entity';
import { Notification } from '../notifications/entities/notification.entity';
import { ListUserPredictionsDto } from './dto/list-user-predictions.dto';
import { CompetitionParticipant } from '../competitions/entities/competition-participant.entity';
import { UserCompetitionFilterStatus } from './dto/list-user-competitions.dto';
import {
  ListUserMarketsDto,
  UserMarketFilterStatus,
  UserMarketsSortBy,
  UserMarketsSortOrder,
} from './dto/list-user-markets.dto';

describe('UsersService', () => {
  let service: UsersService;
  let repository: Repository<User>;
  let predictionsRepository: Repository<Prediction>;
  let participantsRepository: Repository<CompetitionParticipant>;
  let marketsRepository: Repository<Market>;

  const mockUser: User = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    stellar_address: 'GBRPYHIL2CI3WHZDTOOQFC6EB4RRJC3XNRBF7XNZFXNRBF7XNRBF7XN',
    username: 'testuser',
    avatar_url: null,
    total_predictions: 10,
    correct_predictions: 7,
    total_staked_stroops: '1000000',
    total_winnings_stroops: '500000',
    reputation_score: 85,
    season_points: 100,
    role: 'user',
    is_banned: false,
    ban_reason: '',
    banned_at: null,
    banned_by: '',
    created_at: new Date('2024-01-01'),
    updated_at: new Date('2024-01-01'),
  } as User;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOneBy: jest.fn(),
            save: jest.fn(),
            find: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Prediction),
          useValue: {
            createQueryBuilder: jest.fn(),
            find: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Market),
          useValue: {
            find: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Notification),
          useValue: {
            find: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(CompetitionParticipant),
          useValue: {
            createQueryBuilder: jest.fn(),
            find: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    repository = module.get<Repository<User>>(getRepositoryToken(User));
    predictionsRepository = module.get<Repository<Prediction>>(
      getRepositoryToken(Prediction),
    );
    participantsRepository = module.get<Repository<CompetitionParticipant>>(
      getRepositoryToken(CompetitionParticipant),
    );
    marketsRepository = module.get<Repository<Market>>(
      getRepositoryToken(Market),
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findByAddress', () => {
    it('should return a user when found', async () => {
      const findOneByMock = jest
        .spyOn(repository, 'findOneBy')
        .mockResolvedValue(mockUser);

      const result = await service.findByAddress(mockUser.stellar_address);

      expect(result).toEqual(mockUser);
      expect(findOneByMock).toHaveBeenCalledWith({
        stellar_address: mockUser.stellar_address,
      });
    });

    it('should throw NotFoundException when user not found', async () => {
      jest.spyOn(repository, 'findOneBy').mockResolvedValue(null);

      await expect(
        service.findByAddress('NONEXISTENT_ADDRESS'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findUserCompetitions', () => {
    it('should return paginated user competitions', async () => {
      jest.spyOn(repository, 'findOneBy').mockResolvedValue(mockUser);

      const queryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([
          [
            {
              rank: 1,
              score: 100,
              competition: {
                id: 'comp-1',
                title: 'Test Competition',
                end_time: new Date(Date.now() + 10000),
              },
            },
          ],
          1,
        ]),
      };

      jest
        .spyOn(participantsRepository, 'createQueryBuilder')
        .mockReturnValue(queryBuilder as any);

      const result = await service.findUserCompetitions(
        mockUser.stellar_address,
        {
          page: 1,
          limit: 10,
          status: UserCompetitionFilterStatus.Active,
        },
      );

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.data[0].title).toBe('Test Competition');
      expect(queryBuilder.where).toHaveBeenCalledWith(
        'participant.user_id = :userId',
        { userId: mockUser.id },
      );
    });
  });

  describe('findPublicPredictionsByAddress', () => {
    it('should return only resolved-market predictions with outcome mapping', async () => {
      jest.spyOn(repository, 'findOneBy').mockResolvedValue(mockUser);

      const now = new Date('2025-02-01T00:00:00.000Z');
      const queryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([
          [
            {
              id: 'pred-1',
              chosen_outcome: 'YES',
              stake_amount_stroops: '100',
              payout_claimed: false,
              payout_amount_stroops: '0',
              tx_hash: null,
              submitted_at: now,
              market: {
                id: 'mkt-1',
                title: 'Resolved YES market',
                end_time: now,
                resolved_outcome: 'YES',
                is_resolved: true,
                is_cancelled: false,
              },
            },
            {
              id: 'pred-2',
              chosen_outcome: 'NO',
              stake_amount_stroops: '200',
              payout_claimed: false,
              payout_amount_stroops: '0',
              tx_hash: null,
              submitted_at: now,
              market: {
                id: 'mkt-1', // same market, different outcome to test 'incorrect'
                title: 'Resolved YES market',
                end_time: now,
                resolved_outcome: 'YES',
                is_resolved: true,
                is_cancelled: false,
              },
            },
          ],
          2,
        ]),
      };

      jest
        .spyOn(predictionsRepository, 'createQueryBuilder')
        .mockReturnValue(queryBuilder as any);

      const result = await service.findPublicPredictionsByAddress(
        mockUser.stellar_address,
        new ListUserPredictionsDto(),
      );

      expect(result.data[0].outcome).toBe('correct');
      expect(result.data[1].outcome).toBe('incorrect');
    });
  });

  describe('findMarketsByAddress', () => {
    const queryBuilder = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn(),
    };

    beforeEach(() => {
      jest.clearAllMocks();
      queryBuilder.leftJoinAndSelect.mockReturnThis();
      queryBuilder.where.mockReturnThis();
      queryBuilder.andWhere.mockReturnThis();
      queryBuilder.orderBy.mockReturnThis();
      queryBuilder.skip.mockReturnThis();
      queryBuilder.take.mockReturnThis();
    });

    it('should scope markets to creator and return pagination', async () => {
      jest.spyOn(repository, 'findOneBy').mockResolvedValue(mockUser);
      queryBuilder.getManyAndCount.mockResolvedValue([[], 0]);
      jest
        .spyOn(marketsRepository, 'createQueryBuilder')
        .mockReturnValue(queryBuilder as any);

      const result = await service.findMarketsByAddress(
        mockUser.stellar_address,
        new ListUserMarketsDto(),
      );

      expect(queryBuilder.where).toHaveBeenCalledWith(
        'market.creatorId = :userId',
        { userId: mockUser.id },
      );
      expect(queryBuilder.orderBy).toHaveBeenCalledWith(
        'market.created_at',
        'DESC',
      );
      expect(result).toEqual({ data: [], total: 0, page: 1, limit: 20 });
    });

    it('should filter active markets', async () => {
      jest.spyOn(repository, 'findOneBy').mockResolvedValue(mockUser);
      queryBuilder.getManyAndCount.mockResolvedValue([[], 0]);
      jest
        .spyOn(marketsRepository, 'createQueryBuilder')
        .mockReturnValue(queryBuilder as any);

      await service.findMarketsByAddress(mockUser.stellar_address, {
        status: UserMarketFilterStatus.Active,
      } as ListUserMarketsDto);

      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        'market.is_resolved = false AND market.is_cancelled = false',
      );
    });

    it('should filter resolved markets', async () => {
      jest.spyOn(repository, 'findOneBy').mockResolvedValue(mockUser);
      queryBuilder.getManyAndCount.mockResolvedValue([[], 0]);
      jest
        .spyOn(marketsRepository, 'createQueryBuilder')
        .mockReturnValue(queryBuilder as any);

      await service.findMarketsByAddress(mockUser.stellar_address, {
        status: UserMarketFilterStatus.Resolved,
      } as ListUserMarketsDto);

      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        'market.is_resolved = true',
      );
    });

    it('should filter cancelled markets', async () => {
      jest.spyOn(repository, 'findOneBy').mockResolvedValue(mockUser);
      queryBuilder.getManyAndCount.mockResolvedValue([[], 0]);
      jest
        .spyOn(marketsRepository, 'createQueryBuilder')
        .mockReturnValue(queryBuilder as any);

      await service.findMarketsByAddress(mockUser.stellar_address, {
        status: UserMarketFilterStatus.Cancelled,
      } as ListUserMarketsDto);

      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        'market.is_cancelled = true',
      );
    });

    it('should sort by participant_count and order asc', async () => {
      jest.spyOn(repository, 'findOneBy').mockResolvedValue(mockUser);
      queryBuilder.getManyAndCount.mockResolvedValue([[], 0]);
      jest
        .spyOn(marketsRepository, 'createQueryBuilder')
        .mockReturnValue(queryBuilder as any);

      await service.findMarketsByAddress(mockUser.stellar_address, {
        sort_by: UserMarketsSortBy.ParticipantCount,
        order: UserMarketsSortOrder.Asc,
      } as ListUserMarketsDto);

      expect(queryBuilder.orderBy).toHaveBeenCalledWith(
        'market.participant_count',
        'ASC',
      );
    });
  });
});
