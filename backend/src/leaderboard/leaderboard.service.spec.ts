import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getDataSourceToken } from '@nestjs/typeorm';
import { LeaderboardService } from './leaderboard.service';
import { LeaderboardEntry } from './entities/leaderboard-entry.entity';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { LeaderboardQueryDto } from './dto/leaderboard-query.dto';

describe('LeaderboardService', () => {
  let service: LeaderboardService;

  const mockUser: Partial<User> = {
    id: 'user-uuid-1',
    stellar_address: 'GBRPYHIL2CI3WHZDTOOQFC6EB4RRJC3XNRBF7XN',
    username: 'testuser',
    reputation_score: 100,
    season_points: 50,
    total_predictions: 10,
    correct_predictions: 7,
    total_winnings_stroops: '500000',
  };

  const mockEntry: Partial<LeaderboardEntry> = {
    id: 'entry-uuid-1',
    user_id: 'user-uuid-1',
    user: mockUser as User,
    rank: 1,
    reputation_score: 100,
    season_points: 50,
    total_predictions: 10,
    correct_predictions: 7,
    total_winnings_stroops: '500000',
  };

  const mockQb = {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn(),
    getOne: jest.fn(),
  };

  const mockEntryRepository = {
    createQueryBuilder: jest.fn(() => mockQb),
  };

  const mockUsersService = {
    findAll: jest.fn(),
  };

  const mockDataSource = {
    transaction: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LeaderboardService,
        {
          provide: getRepositoryToken(LeaderboardEntry),
          useValue: mockEntryRepository,
        },
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
        {
          provide: getDataSourceToken(),
          useValue: mockDataSource,
        },
      ],
    }).compile();

    service = module.get<LeaderboardService>(LeaderboardService);
    jest.clearAllMocks();
    mockEntryRepository.createQueryBuilder.mockReturnValue(mockQb);
    mockQb.leftJoinAndSelect.mockReturnThis();
    mockQb.where.mockReturnThis();
    mockQb.orderBy.mockReturnThis();
    mockQb.addOrderBy.mockReturnThis();
    mockQb.skip.mockReturnThis();
    mockQb.take.mockReturnThis();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getLeaderboard', () => {
    it('should return global all-time leaderboard ordered by reputation_score', async () => {
      mockQb.getManyAndCount.mockResolvedValue([[mockEntry], 1]);
      const query: LeaderboardQueryDto = { page: 1, limit: 20 };

      const result = await service.getLeaderboard(query);

      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.data[0].rank).toBe(1);
      expect(result.data[0].reputation_score).toBe(100);
      expect(mockQb.where).toHaveBeenCalledWith('entry.season_id IS NULL');
      expect(mockQb.orderBy).toHaveBeenCalledWith(
        'entry.reputation_score',
        'DESC',
      );
    });

    it('should filter by season_id and order by season_points', async () => {
      mockQb.getManyAndCount.mockResolvedValue([[mockEntry], 1]);
      const query: LeaderboardQueryDto = {
        page: 1,
        limit: 20,
        season_id: 'season-1',
      };

      await service.getLeaderboard(query);

      expect(mockQb.where).toHaveBeenCalledWith(
        'entry.season_id = :season_id',
        {
          season_id: 'season-1',
        },
      );
      expect(mockQb.orderBy).toHaveBeenCalledWith(
        'entry.season_points',
        'DESC',
      );
    });

    it('should compute accuracy_rate correctly', async () => {
      mockQb.getManyAndCount.mockResolvedValue([[mockEntry], 1]);

      const result = await service.getLeaderboard({ page: 1, limit: 20 });

      // 7/10 * 100 = 70.0
      expect(result.data[0].accuracy_rate).toBe('70.0');
    });

    it('should return accuracy_rate of 0.0 when no predictions', async () => {
      const entryNoPredictions = {
        ...mockEntry,
        total_predictions: 0,
        correct_predictions: 0,
      };
      mockQb.getManyAndCount.mockResolvedValue([[entryNoPredictions], 1]);

      const result = await service.getLeaderboard({ page: 1, limit: 20 });

      expect(result.data[0].accuracy_rate).toBe('0.0');
    });

    it('should cap limit at 100', async () => {
      mockQb.getManyAndCount.mockResolvedValue([[], 0]);

      await service.getLeaderboard({ page: 1, limit: 999 });

      expect(mockQb.take).toHaveBeenCalledWith(100);
    });
  });

  describe('recalculateRanks', () => {
    it('should sort users by reputation_score and run in a transaction', async () => {
      const users = [
        { ...mockUser, id: 'u1', reputation_score: 50 },
        { ...mockUser, id: 'u2', reputation_score: 100 },
      ];
      mockUsersService.findAll.mockResolvedValue(users);
      mockDataSource.transaction.mockResolvedValue(undefined);

      await service.recalculateRanks();

      expect(mockUsersService.findAll).toHaveBeenCalled();
      expect(mockDataSource.transaction).toHaveBeenCalled();
    });
  });
});
