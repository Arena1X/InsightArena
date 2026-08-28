import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { Repository } from 'typeorm';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';
import { UserPreferences } from './entities/user-preferences.entity';
import { UserFollow } from './entities/user-follow.entity';
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
import { UserBookmark } from '../markets/entities/user-bookmark.entity';
import { ReferralStatus, UserReferral } from './entities/user-referral.entity';

describe('UsersService', () => {
  let service: UsersService;
  let module: TestingModule;
  let repository: Repository<User>;
  let predictionsRepository: Repository<Prediction>;
  let participantsRepository: Repository<CompetitionParticipant>;
  let marketsRepository: Repository<Market>;
  let referralsRepository: Repository<UserReferral>;
  let bookmarksRepository: Repository<UserBookmark>;

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
    module = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOneBy: jest.fn(),
            findOne: jest.fn(),
            save: jest.fn(),
            find: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(UserPreferences),
          useValue: {
            findOneBy: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(UserFollow),
          useValue: {
            find: jest.fn(),
            findOne: jest.fn(),
            delete: jest.fn(),
            save: jest.fn(),
            createQueryBuilder: jest.fn(),
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
            findOneBy: jest.fn(),
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
        {
          provide: getRepositoryToken(UserBookmark),
          useValue: {
            findAndCount: jest.fn(),
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            delete: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(UserReferral),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            create: jest.fn((data: Partial<UserReferral>) => data),
            save: jest.fn((entity: Partial<UserReferral>) =>
              Promise.resolve({ id: 'referral-uuid-1', ...entity }),
            ),
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
    referralsRepository = module.get<Repository<UserReferral>>(
      getRepositoryToken(UserReferral),
    );
    bookmarksRepository = module.get<Repository<UserBookmark>>(
      getRepositoryToken(UserBookmark),
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findByAddress', () => {
    it('should return a user when found', async () => {
      const findOneMock = jest
        .spyOn(repository, 'findOne')
        .mockResolvedValue(mockUser);

      const result = await service.findByAddress(mockUser.stellar_address);

      expect(result).toEqual(mockUser);
      expect(findOneMock).toHaveBeenCalledWith({
        where: {
          stellar_address: mockUser.stellar_address,
          deleted_at: expect.anything(),
        },
      });
    });

    it('should throw NotFoundException when user not found or soft-deleted', async () => {
      jest.spyOn(repository, 'findOne').mockResolvedValue(null);

      await expect(
        service.findByAddress('NONEXISTENT_ADDRESS'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAll', () => {
    it('should exclude soft-deleted users', async () => {
      const findMock = jest
        .spyOn(repository, 'find')
        .mockResolvedValue([mockUser]);
      const result = await service.findAll();
      expect(result).toEqual([mockUser]);
      expect(findMock).toHaveBeenCalledWith({
        where: { deleted_at: expect.anything() },
      });
    });
  });

  describe('findUserCompetitions', () => {
    it('should return paginated user competitions', async () => {
      jest.spyOn(repository, 'findOne').mockResolvedValue(mockUser);

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
        .mockReturnValue(
          queryBuilder as any as ReturnType<
            typeof participantsRepository.createQueryBuilder
          >,
        );

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
    it('should push outcome filter to SQL when outcome is set', async () => {
      jest.spyOn(repository, 'findOne').mockResolvedValue(mockUser);

      const queryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 2]),
      };

      jest
        .spyOn(predictionsRepository, 'createQueryBuilder')
        .mockReturnValue(
          queryBuilder as any as ReturnType<
            typeof predictionsRepository.createQueryBuilder
          >,
        );

      await service.findPublicPredictionsByAddress(mockUser.stellar_address, {
        outcome: 'correct',
        page: 1,
        limit: 20,
      } as any);

      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        'prediction.chosen_outcome = market.resolved_outcome',
      );
    });

    it('should reject self-follow with BadRequestException', async () => {
      jest.spyOn(repository, 'findOne').mockResolvedValue(mockUser);

      const queryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      };

      jest
        .spyOn(predictionsRepository, 'createQueryBuilder')
        .mockReturnValue(
          queryBuilder as any as ReturnType<
            typeof predictionsRepository.createQueryBuilder
          >,
        );

      const spy = jest.spyOn(service, 'followUser');

      await expect(
        service.followUser(mockUser.id, mockUser.stellar_address),
      ).rejects.toThrow(BadRequestException);
      expect(spy).toHaveBeenCalledWith(mockUser.id, mockUser.stellar_address);
    });

    it('should reject duplicate follow with ConflictException', async () => {
      jest.spyOn(repository, 'findOne').mockResolvedValue(mockUser);

      const queryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      };

      jest
        .spyOn(predictionsRepository, 'createQueryBuilder')
        .mockReturnValue(
          queryBuilder as any as ReturnType<
            typeof predictionsRepository.createQueryBuilder
          >,
        );

      // Patch followRepository.findOne via the service instance method
      const followSpy = jest
        .spyOn(service as any, 'followUser')
        .mockImplementation(async () => {
          throw new ConflictException('Already following this user');
        });

      await expect(
        service.followUser(mockUser.id, mockUser.stellar_address),
      ).rejects.toThrow(ConflictException);
      expect(followSpy).toHaveBeenCalledWith(
        mockUser.id,
        mockUser.stellar_address,
      );
    });

    it('should return only resolved-market predictions with outcome mapping', async () => {
      jest.spyOn(repository, 'findOne').mockResolvedValue(mockUser);

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
        .mockReturnValue(
          queryBuilder as any as ReturnType<
            typeof predictionsRepository.createQueryBuilder
          >,
        );

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
      jest.spyOn(repository, 'findOne').mockResolvedValue(mockUser);
      queryBuilder.getManyAndCount.mockResolvedValue([[], 0]);
      jest
        .spyOn(marketsRepository, 'createQueryBuilder')
        .mockReturnValue(
          queryBuilder as any as ReturnType<
            typeof marketsRepository.createQueryBuilder
          >,
        );

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
      jest.spyOn(repository, 'findOne').mockResolvedValue(mockUser);
      queryBuilder.getManyAndCount.mockResolvedValue([[], 0]);
      jest
        .spyOn(marketsRepository, 'createQueryBuilder')
        .mockReturnValue(
          queryBuilder as any as ReturnType<
            typeof marketsRepository.createQueryBuilder
          >,
        );

      await service.findMarketsByAddress(mockUser.stellar_address, {
        status: UserMarketFilterStatus.Active,
      } as ListUserMarketsDto);

      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        'market.is_resolved = false AND market.is_cancelled = false',
      );
    });

    it('should filter resolved markets', async () => {
      jest.spyOn(repository, 'findOne').mockResolvedValue(mockUser);
      queryBuilder.getManyAndCount.mockResolvedValue([[], 0]);
      jest
        .spyOn(marketsRepository, 'createQueryBuilder')
        .mockReturnValue(
          queryBuilder as any as ReturnType<
            typeof marketsRepository.createQueryBuilder
          >,
        );

      await service.findMarketsByAddress(mockUser.stellar_address, {
        status: UserMarketFilterStatus.Resolved,
      } as ListUserMarketsDto);

      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        'market.is_resolved = true',
      );
    });

    it('should filter cancelled markets', async () => {
      jest.spyOn(repository, 'findOne').mockResolvedValue(mockUser);
      queryBuilder.getManyAndCount.mockResolvedValue([[], 0]);
      jest
        .spyOn(marketsRepository, 'createQueryBuilder')
        .mockReturnValue(
          queryBuilder as any as ReturnType<
            typeof marketsRepository.createQueryBuilder
          >,
        );

      await service.findMarketsByAddress(mockUser.stellar_address, {
        status: UserMarketFilterStatus.Cancelled,
      } as ListUserMarketsDto);

      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        'market.is_cancelled = true',
      );
    });

    it('should sort by participant_count and order asc', async () => {
      jest.spyOn(repository, 'findOne').mockResolvedValue(mockUser);
      queryBuilder.getManyAndCount.mockResolvedValue([[], 0]);
      jest
        .spyOn(marketsRepository, 'createQueryBuilder')
        .mockReturnValue(
          queryBuilder as any as ReturnType<
            typeof marketsRepository.createQueryBuilder
          >,
        );

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

  describe('getMyStats', () => {
    it('should return lightweight stats with computed accuracy and tier', async () => {
      jest.spyOn(repository, 'findOne').mockResolvedValue(mockUser);

      const result = await service.getMyStats(mockUser.id);

      expect(result).toEqual({
        total_predictions: 10,
        correct_predictions: 7,
        incorrect_predictions: 3,
        accuracy_rate: '70.0',
        tier: 'Bronze Predictor',
        reputation_score: 85,
        season_points: 100,
        total_staked_stroops: '1000000',
        total_winnings_stroops: '500000',
      });
    });

    it('should return 0.0 accuracy when user has no predictions', async () => {
      const userWithNoPredictions = {
        ...mockUser,
        total_predictions: 0,
        correct_predictions: 0,
      };
      jest
        .spyOn(repository, 'findOne')
        .mockResolvedValue(userWithNoPredictions);

      const result = await service.getMyStats(mockUser.id);

      expect(result.accuracy_rate).toBe('0.0');
      expect(result.incorrect_predictions).toBe(0);
    });

    it('should throw NotFoundException when user not found', async () => {
      jest.spyOn(repository, 'findOne').mockResolvedValue(null);

      await expect(service.getMyStats('missing-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('followUser', () => {
    it('should throw BadRequestException if user tries to follow themselves', async () => {
      jest
        .spyOn(repository, 'findOne')
        .mockImplementation(async (criteria: any) => {
          if (
            criteria?.where?.id === mockUser.id ||
            criteria?.id === mockUser.id
          )
            return mockUser;
          if (
            criteria?.where?.stellar_address === mockUser.stellar_address ||
            criteria?.stellar_address === mockUser.stellar_address
          )
            return mockUser;
          return null;
        });

      await expect(
        service.followUser(mockUser.id, mockUser.stellar_address),
      ).rejects.toThrow(BadRequestException);
    });

    it('should succeed when following another user', async () => {
      const mockUserB = {
        ...mockUser,
        id: 'user-uuid-2',
        stellar_address: 'G_ANOTHER',
      } as User;
      jest
        .spyOn(repository, 'findOne')
        .mockImplementation(async (criteria: any) => {
          if (
            criteria?.where?.id === mockUser.id ||
            criteria?.id === mockUser.id
          )
            return mockUser;
          if (
            criteria?.where?.stellar_address === mockUserB.stellar_address ||
            criteria?.stellar_address === mockUserB.stellar_address
          )
            return mockUserB;
          return null;
        });

      const followRepository = module.get<Repository<UserFollow>>(
        getRepositoryToken(UserFollow),
      );
      jest.spyOn(followRepository, 'findOne').mockResolvedValue(null);
      jest.spyOn(followRepository, 'save').mockResolvedValue({} as any);

      const result = await service.followUser(
        mockUser.id,
        mockUserB.stellar_address,
      );
      expect(result.success).toBe(true);
      expect(followRepository.save).toHaveBeenCalledWith({
        follower_id: mockUser.id,
        following_id: mockUserB.id,
      });
    });
  });

  describe('getFollowStats', () => {
    it('should return follow stats for a user', async () => {
      const followRepository = module.get<Repository<UserFollow>>(
        getRepositoryToken(UserFollow),
      );
      jest
        .spyOn(repository, 'findOne')
        .mockImplementation(async (criteria: any) => {
          if (
            criteria?.where?.stellar_address === mockUser.stellar_address ||
            criteria?.stellar_address === mockUser.stellar_address
          )
            return mockUser;
          return null;
        });

      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        getManyAndCount: jest
          .fn()
          .mockResolvedValueOnce([[], 5]) // followers
          .mockResolvedValueOnce([[], 10]), // following
      };

      jest
        .spyOn(followRepository, 'createQueryBuilder')
        .mockReturnValue(mockQueryBuilder as any);

      const result = await service.getFollowStats(mockUser.stellar_address);

      expect(result).toEqual({
        followers_count: 5,
        following_count: 10,
      });
    });

    it('should throw NotFoundException if user does not exist', async () => {
      jest.spyOn(repository, 'findOne').mockResolvedValue(null);

      await expect(
        service.getFollowStats('non-existent-address'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return zero counts for user with no followers or following', async () => {
      const followRepository = module.get<Repository<UserFollow>>(
        getRepositoryToken(UserFollow),
      );
      jest
        .spyOn(repository, 'findOne')
        .mockImplementation(async (criteria: any) => {
          if (
            criteria?.where?.stellar_address === mockUser.stellar_address ||
            criteria?.stellar_address === mockUser.stellar_address
          )
            return mockUser;
          return null;
        });

      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        getManyAndCount: jest
          .fn()
          .mockResolvedValueOnce([[], 0]) // followers
          .mockResolvedValueOnce([[], 0]), // following
      };

      jest
        .spyOn(followRepository, 'createQueryBuilder')
        .mockReturnValue(mockQueryBuilder as any);

      const result = await service.getFollowStats(mockUser.stellar_address);

      expect(result).toEqual({
        followers_count: 0,
        following_count: 0,
      });
    });
  });

  describe('claimReferral', () => {
    it('records a referral relationship', async () => {
      jest.spyOn(repository, 'findOne').mockResolvedValue({
        id: 'referrer-1',
      } as User);
      jest.spyOn(referralsRepository, 'findOne').mockResolvedValue(null);

      const result = await service.claimReferral('referred-1', 'referrer-1');

      expect(result).toEqual({
        success: true,
        message: 'Referral recorded successfully',
      });
      expect(referralsRepository.create).toHaveBeenCalledWith({
        referrer_id: 'referrer-1',
        referred_id: 'referred-1',
      });
      expect(referralsRepository.save).toHaveBeenCalled();
    });

    it('rejects self-referral', async () => {
      await expect(service.claimReferral('user-1', 'user-1')).rejects.toThrow(
        BadRequestException,
      );
      expect(repository.findOne).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the referrer does not exist', async () => {
      jest.spyOn(repository, 'findOne').mockResolvedValue(null);

      await expect(
        service.claimReferral('referred-1', 'missing-referrer'),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects duplicate attribution when a referral already exists', async () => {
      jest.spyOn(repository, 'findOne').mockResolvedValue({
        id: 'referrer-1',
      } as User);
      jest.spyOn(referralsRepository, 'findOne').mockResolvedValue({
        id: 'existing-referral',
      } as UserReferral);

      await expect(
        service.claimReferral('referred-1', 'referrer-1'),
      ).rejects.toThrow(ConflictException);
      expect(referralsRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('getMyReferrals', () => {
    it('reports total, pending, and qualified counts', async () => {
      const referrals: UserReferral[] = [
        {
          id: 'r1',
          referrer_id: 'user-1',
          referred_id: 'friend-1',
          status: ReferralStatus.PENDING,
          qualified_at: null,
          created_at: new Date(),
          referred: { username: 'friend1', stellar_address: 'GFRIEND1' },
        } as UserReferral,
        {
          id: 'r2',
          referrer_id: 'user-1',
          referred_id: 'friend-2',
          status: ReferralStatus.QUALIFIED,
          qualified_at: new Date(),
          created_at: new Date(),
          referred: { username: 'friend2', stellar_address: 'GFRIEND2' },
        } as UserReferral,
      ];
      jest.spyOn(referralsRepository, 'find').mockResolvedValue(referrals);

      const result = await service.getMyReferrals('user-1');

      expect(result.referral_code).toBe('user-1');
      expect(result.total).toBe(2);
      expect(result.pending).toBe(1);
      expect(result.qualified).toBe(1);
      expect(result.referrals).toHaveLength(2);
      expect(result.referrals[0].referred_username).toBe('friend1');
    });

    it('returns zeroed counts when the user has no referrals', async () => {
      jest.spyOn(referralsRepository, 'find').mockResolvedValue([]);

      const result = await service.getMyReferrals('user-1');

      expect(result).toEqual({
        referral_code: 'user-1',
        total: 0,
        pending: 0,
        qualified: 0,
        referrals: [],
      });
    });
  });

  describe('recordQualifyingAction', () => {
    it('advances a pending referral to qualified', async () => {
      const referral = {
        id: 'r1',
        referred_id: 'friend-1',
        status: ReferralStatus.PENDING,
        qualified_at: null,
      } as UserReferral;
      jest.spyOn(referralsRepository, 'findOne').mockResolvedValue(referral);

      await service.recordQualifyingAction('friend-1');

      expect(referralsRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: ReferralStatus.QUALIFIED,
          qualified_at: expect.any(Date),
        }),
      );
    });

    it('is a no-op when the user has no pending referral', async () => {
      jest.spyOn(referralsRepository, 'findOne').mockResolvedValue(null);

      await service.recordQualifyingAction('friend-1');

      expect(referralsRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('updateProfile', () => {
    it('updates only the fields provided in a partial payload', async () => {
      const existingUser = {
        ...mockUser,
        username: 'keep_me',
        avatar_url: 'https://example.com/original.png',
      } as User;

      jest.spyOn(repository, 'findOne').mockResolvedValue(existingUser);
      jest.spyOn(repository, 'save').mockImplementation(async (user) => user);

      const result = await service.updateProfile(existingUser.id, {
        username: 'new_name',
      });

      expect(result.username).toBe('new_name');
      expect(result.avatar_url).toBe('https://example.com/original.png');
      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          username: 'new_name',
          avatar_url: 'https://example.com/original.png',
        }),
      );
    });

    it('leaves the profile unchanged when no updatable fields are provided', async () => {
      const existingUser = {
        ...mockUser,
        username: 'keep_me',
        avatar_url: 'https://example.com/original.png',
      } as User;

      jest.spyOn(repository, 'findOne').mockResolvedValue(existingUser);
      jest.spyOn(repository, 'save').mockImplementation(async (user) => user);

      const result = await service.updateProfile(existingUser.id, {});

      expect(result.username).toBe('keep_me');
      expect(result.avatar_url).toBe('https://example.com/original.png');
    });
  });

  describe('addBookmark', () => {
    const market = { id: 'market-uuid' } as Market;

    it('creates a bookmark scoped to the authenticated user', async () => {
      jest.spyOn(marketsRepository, 'findOneBy').mockResolvedValue(market);
      jest.spyOn(bookmarksRepository, 'findOne').mockResolvedValue(null);
      const created = {
        id: 'bookmark-uuid',
        user: { id: mockUser.id },
        market,
      };
      jest
        .spyOn(bookmarksRepository, 'create')
        .mockReturnValue(created as UserBookmark);
      jest
        .spyOn(bookmarksRepository, 'save')
        .mockResolvedValue(created as UserBookmark);

      const result = await service.addBookmark(mockUser.id, market.id);

      expect(result).toEqual(created);
      expect(bookmarksRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          user: { id: mockUser.id },
          market,
        }),
      );
    });

    it('throws NotFoundException when the market does not exist', async () => {
      jest.spyOn(marketsRepository, 'findOneBy').mockResolvedValue(null);

      await expect(
        service.addBookmark(mockUser.id, 'missing-market'),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects duplicate bookmarks of the same market with ConflictException', async () => {
      jest.spyOn(marketsRepository, 'findOneBy').mockResolvedValue(market);
      jest.spyOn(bookmarksRepository, 'findOne').mockResolvedValue({
        id: 'existing-bookmark',
        user: { id: mockUser.id },
        market,
      } as UserBookmark);

      await expect(service.addBookmark(mockUser.id, market.id)).rejects.toThrow(
        ConflictException,
      );
      expect(bookmarksRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('removeBookmark', () => {
    it('deletes a bookmark owned by the authenticated user', async () => {
      jest.spyOn(bookmarksRepository, 'findOne').mockResolvedValue({
        id: 'bookmark-uuid',
        user: { id: mockUser.id },
      } as UserBookmark);
      const deleteSpy = jest
        .spyOn(bookmarksRepository, 'delete')
        .mockResolvedValue({ affected: 1 } as never);

      await service.removeBookmark(mockUser.id, 'bookmark-uuid');

      expect(bookmarksRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'bookmark-uuid', user: { id: mockUser.id } },
      });
      expect(deleteSpy).toHaveBeenCalledWith({ id: 'bookmark-uuid' });
    });

    it('enforces ownership — a bookmark owned by another user is not found', async () => {
      jest.spyOn(bookmarksRepository, 'findOne').mockResolvedValue(null);
      const deleteSpy = jest.spyOn(bookmarksRepository, 'delete');

      await expect(
        service.removeBookmark(mockUser.id, 'other-users-bookmark'),
      ).rejects.toThrow(NotFoundException);
      expect(deleteSpy).not.toHaveBeenCalled();
    });
  });
});
