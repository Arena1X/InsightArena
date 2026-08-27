import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getDataSourceToken } from '@nestjs/typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { LeaderboardService } from './leaderboard.service';
import { LeaderboardEntry } from './entities/leaderboard-entry.entity';
import { LeaderboardHistory } from './entities/leaderboard-history.entity';
import { LeaderboardSnapshot } from './entities/leaderboard-snapshot.entity';
import { Prediction } from '../predictions/entities/prediction.entity';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { SeasonsService } from '../seasons/seasons.service';
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

  const makeHistoryEntry = (overrides: Partial<LeaderboardHistory>) =>
    ({
      id: 'history-id',
      user_id: 'user-uuid-1',
      user: mockUser as User,
      snapshot_date: new Date('2024-01-01'),
      rank: 1,
      reputation_score: 100,
      season_points: 0,
      total_predictions: 10,
      correct_predictions: 5,
      total_winnings_stroops: '0',
      season_id: null,
      ...overrides,
    }) as LeaderboardHistory;

  const mockQb = {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn(),
    getMany: jest.fn(),
    getOne: jest.fn(),
  };

  const mockEntryRepository = {
    createQueryBuilder: jest.fn(() => mockQb),
    findOne: jest.fn(),
    find: jest.fn(),
  };

  const mockHistoryRepository = {
    createQueryBuilder: jest.fn(() => mockQb),
    findOne: jest.fn(),
    find: jest.fn(),
    findAndCount: jest.fn(),
  };

  const mockSnapshotQb = {
    distinctOn: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([]),
  };

  const mockSnapshotRepository = {
    createQueryBuilder: jest.fn(() => mockSnapshotQb),
    create: jest.fn((entry) => entry),
    save: jest.fn(),
    find: jest.fn(),
    delete: jest.fn().mockResolvedValue({ affected: 0 }),
  };

  const mockPredictionQb = {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    having: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([]),
    getRawMany: jest.fn().mockResolvedValue([]),
  };

  const mockPredictionRepository = {
    createQueryBuilder: jest.fn(() => mockPredictionQb),
  };

  const mockUsersService = {
    findAll: jest.fn(),
    findByAddress: jest.fn(),
  };

  const mockSeasonsService = {
    findActive: jest.fn(),
  };

  const mockDataSource = {
    transaction: jest.fn(),
  };

  const mockCacheManager = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
  };

  const mockConfigService = {
    get: jest.fn((_key: string, defaultValue?: unknown) => defaultValue),
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
          provide: getRepositoryToken(LeaderboardHistory),
          useValue: mockHistoryRepository,
        },
        {
          provide: getRepositoryToken(LeaderboardSnapshot),
          useValue: mockSnapshotRepository,
        },
        {
          provide: getRepositoryToken(Prediction),
          useValue: mockPredictionRepository,
        },
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
        {
          provide: SeasonsService,
          useValue: mockSeasonsService,
        },
        {
          provide: getDataSourceToken(),
          useValue: mockDataSource,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: CACHE_MANAGER,
          useValue: mockCacheManager,
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
    mockSnapshotRepository.createQueryBuilder.mockReturnValue(mockSnapshotQb);
    mockSnapshotQb.distinctOn.mockReturnThis();
    mockSnapshotQb.where.mockReturnThis();
    mockSnapshotQb.andWhere.mockReturnThis();
    mockSnapshotQb.orderBy.mockReturnThis();
    mockSnapshotQb.addOrderBy.mockReturnThis();
    mockSnapshotQb.getMany.mockResolvedValue([]);
    mockPredictionRepository.createQueryBuilder.mockReturnValue(
      mockPredictionQb,
    );
    mockPredictionQb.getMany.mockResolvedValue([]);
    mockPredictionQb.getRawMany.mockResolvedValue([]);
    mockConfigService.get.mockImplementation(
      (_key: string, defaultValue?: unknown) => defaultValue,
    );
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

    it('should compute rank_delta from the latest prior snapshot', async () => {
      mockQb.getManyAndCount.mockResolvedValue([[mockEntry], 1]);
      mockSnapshotQb.getMany.mockResolvedValue([
        { user_id: 'user-uuid-1', rank: 4 },
      ]);

      const result = await service.getLeaderboard({ page: 1, limit: 20 });

      // prior rank 4 -> current rank 1 means moved up 3 places
      expect(result.data[0].rank_delta).toBe(3);
      expect(mockSnapshotQb.andWhere).toHaveBeenCalledWith(
        'snap.season_id IS NULL',
      );
    });

    it('should return null rank_delta when the user has no prior snapshot', async () => {
      mockQb.getManyAndCount.mockResolvedValue([[mockEntry], 1]);
      mockSnapshotQb.getMany.mockResolvedValue([]);

      const result = await service.getLeaderboard({ page: 1, limit: 20 });

      expect(result.data[0].rank_delta).toBeNull();
    });

    it('should scope prior snapshot lookup to the requested season', async () => {
      mockQb.getManyAndCount.mockResolvedValue([[mockEntry], 1]);
      mockSnapshotQb.getMany.mockResolvedValue([]);

      await service.getLeaderboard({
        page: 1,
        limit: 20,
        season_id: 'season-1',
      });

      expect(mockSnapshotQb.andWhere).toHaveBeenCalledWith(
        'snap.season_id = :seasonId',
        { seasonId: 'season-1' },
      );
    });
  });

  describe('getLeaderboardCursor', () => {
    function makeEntry(rank: number, userId: string, score: number) {
      return {
        ...mockEntry,
        rank,
        user_id: userId,
        reputation_score: score,
        user: { ...mockUser, id: userId } as User,
      };
    }

    it('round-trips an opaque cursor and returns no duplicated/skipped rows across two pages', async () => {
      const row1 = makeEntry(1, 'u1', 100);
      const row2 = makeEntry(2, 'u2', 90);
      const row3 = makeEntry(3, 'u3', 80);

      mockQb.getMany
        .mockResolvedValueOnce([row1, row2, row3])
        .mockResolvedValueOnce([row3]);

      const page1 = await service.getLeaderboardCursor({ limit: 2 });
      expect(page1.hasMore).toBe(true);
      expect(page1.nextCursor).toEqual(expect.any(String));
      expect(page1.nextCursor).not.toMatch(/^\d+:/); // opaque, not a raw "rank:id" string

      const page2 = await service.getLeaderboardCursor({
        limit: 2,
        cursor: page1.nextCursor!,
      });

      const ids1 = page1.data.map((e) => e.user_id);
      const ids2 = page2.data.map((e) => e.user_id);
      expect(ids1).toEqual(['u1', 'u2']);
      expect(ids2).toEqual(['u3']);
      expect(ids1.filter((id) => ids2.includes(id))).toHaveLength(0);
      expect(page2.hasMore).toBe(false);
      expect(page2.nextCursor).toBeNull();
    });

    it('returns hasMore=false and nextCursor=null on the last page', async () => {
      mockQb.getMany.mockResolvedValueOnce([makeEntry(1, 'u1', 100)]);

      const result = await service.getLeaderboardCursor({ limit: 20 });

      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeNull();
    });

    it('throws BadRequestException for a malformed cursor', async () => {
      const malformedCursor = Buffer.from('bogus', 'utf-8').toString(
        'base64',
      );

      await expect(
        service.getLeaderboardCursor({
          cursor: malformedCursor,
          limit: 20,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getTopLeaderboard', () => {
    it('should return top entries for the active season and cap at 20', async () => {
      mockSeasonsService.findActive.mockResolvedValue({ id: 'season-1' });
      mockQb.getManyAndCount.mockResolvedValue([[mockEntry], 1]);

      const result = await service.getTopLeaderboard(50);

      expect(mockSeasonsService.findActive).toHaveBeenCalled();
      expect(mockQb.where).toHaveBeenCalledWith(
        'entry.season_id = :season_id',
        {
          season_id: 'season-1',
        },
      );
      expect(mockQb.take).toHaveBeenCalledWith(20);
      expect(result).toHaveLength(1);
      expect(result[0].rank).toBe(1);
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

  describe('getTopN', () => {
    it('should return top N entries and cap at 20', async () => {
      const entries = Array.from({ length: 20 }, (_, i) => ({
        ...mockEntry,
        rank: i + 1,
      }));
      mockQb.getMany.mockResolvedValue(entries);
      mockCacheManager.get.mockResolvedValue(null);

      const result = await service.getTopN(25);

      expect(result).toHaveLength(20);
      expect(result[0].rank).toBe(1);
      expect(result[19].rank).toBe(20);
      expect(mockQb.take).toHaveBeenCalledWith(20);
      expect(mockCacheManager.set).toHaveBeenCalledWith(
        'leaderboard:top:20:all',
        expect.any(Array),
        expect.any(Number),
      );
    });

    it('should return cache hit without DB query', async () => {
      const cached = [{ rank: 1 }] as any[];
      mockCacheManager.get.mockResolvedValue(cached);

      const result = await service.getTopN(5);

      expect(result).toBe(cached);
      expect(mockEntryRepository.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('should filter by season_id when provided', async () => {
      const entries = [{ ...mockEntry, rank: 1 }];
      mockQb.getMany.mockResolvedValue(entries);
      mockCacheManager.get.mockResolvedValue(null);

      const result = await service.getTopN(5, 'season-1');

      expect(result).toHaveLength(1);
      expect(mockQb.where).toHaveBeenCalledWith('entry.season_id = :seasonId', {
        seasonId: 'season-1',
      });
    });
  });

  describe('getHistory', () => {
    it('caps limit at 100 and applies offset pagination', async () => {
      mockQb.getManyAndCount.mockResolvedValue([[], 250]);

      await service.getHistory({ page: 2, limit: 500 });

      expect(mockQb.skip).toHaveBeenCalledWith(100);
      expect(mockQb.take).toHaveBeenCalledWith(100);
    });

    it('returns non-overlapping, ordered pages with total count metadata', async () => {
      const pageOneEntries = [
        makeHistoryEntry({ id: 'h1', user_id: 'user-1', rank: 1 }),
        makeHistoryEntry({ id: 'h2', user_id: 'user-2', rank: 2 }),
      ];
      const pageTwoEntries = [
        makeHistoryEntry({ id: 'h3', user_id: 'user-3', rank: 3 }),
        makeHistoryEntry({ id: 'h4', user_id: 'user-4', rank: 4 }),
      ];

      mockQb.getManyAndCount.mockResolvedValueOnce([pageOneEntries, 4]);
      const page1 = await service.getHistory({ page: 1, limit: 2 });

      mockQb.getManyAndCount.mockResolvedValueOnce([pageTwoEntries, 4]);
      const page2 = await service.getHistory({ page: 2, limit: 2 });

      expect(mockQb.skip).toHaveBeenNthCalledWith(1, 0);
      expect(mockQb.skip).toHaveBeenNthCalledWith(2, 2);
      expect(mockQb.orderBy).toHaveBeenCalledWith(
        'history.snapshot_date',
        'DESC',
      );
      expect(mockQb.addOrderBy).toHaveBeenCalledWith('history.rank', 'ASC');

      const page1Ids = page1.data.map((e) => e.user_id);
      const page2Ids = page2.data.map((e) => e.user_id);

      expect(page1Ids).toEqual(['user-1', 'user-2']);
      expect(page2Ids).toEqual(['user-3', 'user-4']);
      expect(page1Ids.some((id) => page2Ids.includes(id))).toBe(false);
      expect(page1.total).toBe(4);
      expect(page2.total).toBe(4);
    });
  });

  describe('getHistoryForAddress', () => {
    beforeEach(() => {
      mockUsersService.findByAddress = jest
        .fn()
        .mockResolvedValue(mockUser as User);
    });

    it('caps limit at 100 and applies offset pagination', async () => {
      mockHistoryRepository.findAndCount.mockResolvedValue([[], 0]);

      await service.getHistoryForAddress(mockUser.stellar_address!, 30, 3, 500);

      expect(mockHistoryRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 200, take: 100 }),
      );
    });

    it('returns non-overlapping, ordered pages with total count metadata', async () => {
      const pageOneEntries = [
        makeHistoryEntry({ id: 'h1', rank: 1, snapshot_date: new Date('2024-01-03') }),
        makeHistoryEntry({ id: 'h2', rank: 2, snapshot_date: new Date('2024-01-02') }),
      ];
      const pageTwoEntries = [
        makeHistoryEntry({ id: 'h3', rank: 3, snapshot_date: new Date('2024-01-01') }),
      ];

      mockHistoryRepository.findAndCount.mockResolvedValueOnce([
        pageOneEntries,
        3,
      ]);
      const page1 = await service.getHistoryForAddress(
        mockUser.stellar_address!,
        30,
        1,
        2,
      );

      mockHistoryRepository.findAndCount.mockResolvedValueOnce([
        pageTwoEntries,
        3,
      ]);
      const page2 = await service.getHistoryForAddress(
        mockUser.stellar_address!,
        30,
        2,
        2,
      );

      expect(mockHistoryRepository.findAndCount).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ skip: 0, take: 2 }),
      );
      expect(mockHistoryRepository.findAndCount).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ skip: 2, take: 2 }),
      );

      const page1Ranks = page1.data.map((e) => e.rank);
      const page2Ranks = page2.data.map((e) => e.rank);

      expect(page1Ranks).toEqual([1, 2]);
      expect(page2Ranks).toEqual([3]);
      expect(page1Ranks.some((r) => page2Ranks.includes(r))).toBe(false);
      expect(page1.total).toBe(3);
      expect(page2.total).toBe(3);
    });
  });

  describe('getUserRank', () => {
    it('should return user rank and stats by stellar address', async () => {
      mockUsersService.findByAddress = jest
        .fn()
        .mockResolvedValue(mockUser as User);
      mockEntryRepository.findOne = jest
        .fn()
        .mockResolvedValue(mockEntry as LeaderboardEntry);

      const result = await service.getUserRank(
        'GBRPYHIL2CI3WHZDTOOQFC6EB4RRJC3XNRBF7XN',
      );

      expect(result.rank).toBe(1);
      expect(result.reputation_score).toBe(100);
      expect(result.accuracy_rate).toBe('70.0');
      expect(mockUsersService.findByAddress).toHaveBeenCalledWith(
        'GBRPYHIL2CI3WHZDTOOQFC6EB4RRJC3XNRBF7XN',
      );
    });

    it('should throw NotFoundException if user not found', async () => {
      mockUsersService.findByAddress = jest
        .fn()
        .mockRejectedValue(new Error('User not found'));

      await expect(service.getUserRank('INVALID_ADDRESS')).rejects.toThrow(
        'User with address',
      );
    });

    it('should throw NotFoundException if no leaderboard entry', async () => {
      mockUsersService.findByAddress = jest
        .fn()
        .mockResolvedValue(mockUser as User);
      mockEntryRepository.findOne = jest.fn().mockResolvedValue(null);

      await expect(
        service.getUserRank('GBRPYHIL2CI3WHZDTOOQFC6EB4RRJC3XNRBF7XN'),
      ).rejects.toThrow('No leaderboard entry found');
    });

    it('should compute accuracy_rate correctly for getUserRank', async () => {
      mockUsersService.findByAddress = jest
        .fn()
        .mockResolvedValue(mockUser as User);
      mockEntryRepository.findOne = jest
        .fn()
        .mockResolvedValue(mockEntry as LeaderboardEntry);

      const result = await service.getUserRank(
        'GBRPYHIL2CI3WHZDTOOQFC6EB4RRJC3XNRBF7XN',
      );

      expect(result.accuracy_rate).toBe('70.0');
    });
  });

  describe('createRankSnapshot', () => {
    it('should save a snapshot for every current leaderboard entry', async () => {
      mockEntryRepository.find = jest
        .fn()
        .mockResolvedValue([
          { ...mockEntry, season_id: null, reputation_score: 100 },
        ]);

      await service.createRankSnapshot();

      expect(mockSnapshotRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'user-uuid-1',
          season_id: null,
          rank: 1,
          score: 100,
        }),
      );
      expect(mockSnapshotRepository.save).toHaveBeenCalled();
    });

    it('should use season_points as the score for season entries', async () => {
      mockEntryRepository.find = jest.fn().mockResolvedValue([
        {
          ...mockEntry,
          season_id: 'season-1',
          season_points: 42,
        },
      ]);

      await service.createRankSnapshot();

      expect(mockSnapshotRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ season_id: 'season-1', score: 42 }),
      );
    });

    it('should do nothing when there are no leaderboard entries', async () => {
      mockEntryRepository.find = jest.fn().mockResolvedValue([]);

      await service.createRankSnapshot();

      expect(mockSnapshotRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('pruneSnapshots', () => {
    it('should delete snapshots older than the configured retention window', async () => {
      mockConfigService.get.mockReturnValue(30);
      mockSnapshotRepository.delete.mockResolvedValue({ affected: 5 });

      await service.pruneSnapshots();

      expect(mockConfigService.get).toHaveBeenCalledWith(
        'LEADERBOARD_SNAPSHOT_RETENTION_DAYS',
        30,
      );
      expect(mockSnapshotRepository.delete).toHaveBeenCalledWith(
        expect.objectContaining({ captured_at: expect.anything() }),
      );
    });
  });

  describe('getRankHistory', () => {
    it('should throw NotFoundException if user not found', async () => {
      mockUsersService.findByAddress = jest.fn().mockResolvedValue(null);

      await expect(
        service.getRankHistory('INVALID_ADDRESS', {}),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return snapshots ordered ascending with signed rank_delta', async () => {
      mockUsersService.findByAddress = jest
        .fn()
        .mockResolvedValue(mockUser as User);
      const capturedAt1 = new Date('2026-07-01T00:00:00Z');
      const capturedAt2 = new Date('2026-07-02T00:00:00Z');
      mockSnapshotRepository.find = jest.fn().mockResolvedValue([
        { captured_at: capturedAt1, rank: 5, score: 10 },
        { captured_at: capturedAt2, rank: 2, score: 20 },
      ]);

      const result = await service.getRankHistory(
        'GBRPYHIL2CI3WHZDTOOQFC6EB4RRJC3XNRBF7XN',
        {},
      );

      expect(result.user_id).toBe('user-uuid-1');
      expect(result.data[0].rank_delta).toBeNull();
      // rank improved from 5 to 2 -> delta of +3
      expect(result.data[1].rank_delta).toBe(3);
    });
  });

  describe('getSnapshots', () => {
    const mockSnapshotQbForDate = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      getOne: jest.fn(),
      getManyAndCount: jest.fn(),
    };

    beforeEach(() => {
      mockSnapshotRepository.createQueryBuilder.mockReturnValue(
        mockSnapshotQbForDate,
      );
      mockSnapshotQbForDate.leftJoinAndSelect.mockReturnThis();
      mockSnapshotQbForDate.where.mockReturnThis();
      mockSnapshotQbForDate.andWhere.mockReturnThis();
      mockSnapshotQbForDate.orderBy.mockReturnThis();
      mockSnapshotQbForDate.take.mockReturnThis();
      mockSnapshotQbForDate.skip.mockReturnThis();
      mockSnapshotQbForDate.getOne.mockResolvedValue(null);
      mockSnapshotQbForDate.getManyAndCount.mockResolvedValue([[], 0]);
    });

    it('should return a message when no snapshots exist before the date', async () => {
      mockSnapshotQbForDate.getOne.mockResolvedValue(null);

      const result = await service.getSnapshots({ date: '2026-01-01' });

      expect(result.data).toEqual([]);
      expect(result.message).toContain('No snapshots found');
      expect(result.total).toBe(0);
    });

    it('should return rankings from the nearest snapshot', async () => {
      const snapshotDate = new Date('2026-07-01T12:00:00Z');
      mockSnapshotQbForDate.getOne.mockResolvedValue({
        captured_at: snapshotDate,
      });
      mockSnapshotQbForDate.getManyAndCount.mockResolvedValue([
        [
          {
            rank: 1,
            user_id: 'user-uuid-1',
            user: { username: 'testuser', stellar_address: 'GABC...' },
            score: 100,
            captured_at: snapshotDate,
          },
        ],
        1,
      ]);

      const result = await service.getSnapshots({ date: '2026-07-15' });

      expect(result.snapshot_date).toEqual(snapshotDate);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].rank).toBe(1);
      expect(result.data[0].username).toBe('testuser');
    });

    it('should filter by season_id when provided', async () => {
      const snapshotDate = new Date('2026-07-01T12:00:00Z');
      mockSnapshotQbForDate.getOne.mockResolvedValue({
        captured_at: snapshotDate,
      });
      mockSnapshotQbForDate.getManyAndCount.mockResolvedValue([[], 0]);

      await service.getSnapshots({ date: '2026-07-15', season_id: 'season-1' });

      // First query (find nearest snapshot) should filter by season
      expect(mockSnapshotQbForDate.andWhere).toHaveBeenCalledWith(
        'snap.season_id = :season_id',
        { season_id: 'season-1' },
      );
    });

    it('should cap limit at 100', async () => {
      const snapshotDate = new Date('2026-07-01T12:00:00Z');
      mockSnapshotQbForDate.getOne.mockResolvedValue({
        captured_at: snapshotDate,
      });
      mockSnapshotQbForDate.getManyAndCount.mockResolvedValue([[], 0]);

      await service.getSnapshots({ date: '2026-07-15', limit: 999 });

      expect(mockSnapshotQbForDate.take).toHaveBeenCalledWith(100);
    });
  });

  describe('coach insights', () => {
    const coachUser = { id: 'user-uuid-1' } as User;

    const COACH_BASE_DATE = new Date('2026-08-01T12:00:00Z').getTime();
    const DAY_MS = 24 * 60 * 60 * 1000;

    /**
     * Builds one prediction row for the coach fixture.
     * resolvedOutcome === null means the market is still unresolved (row is
     * excluded from analysis); is_cancelled rows are excluded too.
     */
    function coachPrediction(
      dayOffset: number,
      category: string,
      chosenOutcome: string,
      resolvedOutcome: string | null,
      overrides: Partial<{ is_resolved: boolean; is_cancelled: boolean }> = {},
    ) {
      return {
        id: `pred-${dayOffset}-${category}-${chosenOutcome}`,
        chosen_outcome: chosenOutcome,
        submitted_at: new Date(COACH_BASE_DATE + dayOffset * DAY_MS),
        market: {
          category,
          is_resolved:
            overrides.is_resolved ??
            (resolvedOutcome !== null && !overrides.is_cancelled),
          is_cancelled: overrides.is_cancelled ?? false,
          resolved_outcome: resolvedOutcome,
        },
      };
    }

    /**
     * Known fixture, ordered most-recent-first exactly like the service's
     * `submitted_at DESC` query returns it.
     *
     * Chronological correctness (oldest -> newest): F F F F T T T T
     *   - trend: prior half 0%, recent half 100% -> improving
     *   - Crypto: d1,d3,d6,d7,d8 -> 5 preds, 3 correct -> '60.0' (best)
     *   - Sports: d2,d4,d5       -> 3 preds, 1 correct -> '33.3' (worst)
     *   - current_streak 4, longest_streak 4
     */
    const coachFixtureDesc = [
      // Most recent entries must be excluded from analysis entirely.
      coachPrediction(20, 'Crypto', 'Yes', null), // unresolved market
      coachPrediction(19, 'Crypto', 'Yes', 'Yes', {
        is_resolved: true,
        is_cancelled: true,
      }), // cancelled market
      // Resolved history (day 8 oldest ... day 1 newest).
      coachPrediction(8, 'Crypto', 'Yes', 'Yes'),
      coachPrediction(7, 'Crypto', 'No', 'No'),
      coachPrediction(6, 'Crypto', 'Yes', 'Yes'),
      coachPrediction(5, 'Sports', 'No', 'No'),
      coachPrediction(4, 'Sports', 'Yes', 'No'),
      coachPrediction(3, 'Crypto', 'No', 'Yes'),
      coachPrediction(2, 'Sports', 'No', 'Yes'),
      coachPrediction(1, 'Crypto', 'Yes', 'No'),
    ];

    it('computes accuracy trend, best/worst category and streaks from a known history', async () => {
      mockPredictionQb.getMany.mockResolvedValue(coachFixtureDesc);

      const result = await service.computeCoachInsights(coachUser);

      expect(result.has_history).toBe(true);
      expect(result.message).toBeNull();
      expect(result.insights).toEqual(
        expect.objectContaining({
          accuracy_trend: {
            direction: 'improving',
            recent_accuracy: 100,
            prior_accuracy: 0,
          },
          best_category: {
            category: 'Crypto',
            predictions: 5,
            correct: 3,
            accuracy_rate: '60.0',
          },
          worst_category: {
            category: 'Sports',
            predictions: 3,
            correct: 1,
            accuracy_rate: '33.3',
          },
          current_streak: 4,
          longest_streak: 4,
          total_resolved: 8,
        }),
      );
    });

    it('queries only the requesting user and filters to resolved markets', async () => {
      mockPredictionQb.getMany.mockResolvedValue([]);

      await service.computeCoachInsights(coachUser);

      expect(mockPredictionQb.where).toHaveBeenCalledWith(
        'prediction.userId = :userId',
        { userId: 'user-uuid-1' },
      );
      expect(mockPredictionQb.andWhere).toHaveBeenCalledWith(
        'market.is_resolved = :isResolved',
        { isResolved: true },
      );
      expect(mockPredictionQb.andWhere).toHaveBeenCalledWith(
        'market.is_cancelled = :isCancelled',
        { isCancelled: false },
      );
      expect(mockPredictionQb.orderBy).toHaveBeenCalledWith(
        'prediction.submitted_at',
        'DESC',
      );
    });

    it('returns the new-user shape below the minimum resolved-prediction threshold', async () => {
      // Only 4 resolved predictions: below MIN_RESOLVED_PREDICTIONS_FOR_INSIGHTS (5).
      const shortHistory = [
        coachPrediction(4, 'Crypto', 'Yes', 'Yes'),
        coachPrediction(3, 'Sports', 'No', 'No'),
        coachPrediction(2, 'Crypto', 'Yes', null), // unresolved, doesn't count
        coachPrediction(2, 'Crypto', 'Yes', 'No'),
        coachPrediction(1, 'Sports', 'No', 'Yes'),
      ];
      mockPredictionQb.getMany.mockResolvedValue(shortHistory);

      const result = await service.computeCoachInsights(coachUser);

      expect(result.has_history).toBe(false);
      expect(result.insights).toBeNull();
      expect(typeof result.message).toBe('string');
      expect(result.message?.length).toBeGreaterThan(0);
    });

    it('tracks current vs longest streak independently when a loss breaks the run', () => {
      // Fixture ordered most-recent-first; chronologically C C C W C ->
      // current streak 1 (only the newest), longest streak 3.
      const history = [
        coachPrediction(5, 'Crypto', 'Yes', 'Yes'), // newest - C
        coachPrediction(4, 'Crypto', 'Yes', 'No'), // W
        coachPrediction(3, 'Crypto', 'Yes', 'Yes'), // C
        coachPrediction(2, 'Crypto', 'Yes', 'Yes'), // C
        coachPrediction(1, 'Crypto', 'Yes', 'Yes'), // oldest - C
      ];

      const result = LeaderboardService.analyzePredictionHistory(history);

      expect(result.has_history).toBe(true);
      expect(result.insights?.current_streak).toBe(1);
      expect(result.insights?.longest_streak).toBe(3);
    });

    it('serves repeated requests within the week from cache without recomputing', async () => {
      const cachedResponse = {
        has_history: true,
        message: null,
        insights: { current_streak: 2 },
      };
      mockCacheManager.get
        .mockResolvedValueOnce(null) // first request: cache miss
        .mockResolvedValueOnce(cachedResponse); // second request within the week

      const computeSpy = jest.spyOn(service, 'computeCoachInsights');

      await service.getCoachInsights(coachUser);
      const second = await service.getCoachInsights(coachUser);

      expect(computeSpy).toHaveBeenCalledTimes(1);
      expect(second).toBe(cachedResponse);
    });

    it('scopes the cache key per user and per ISO week with a bounded TTL', async () => {
      mockCacheManager.get.mockResolvedValue(null);

      await service.getCoachInsights(coachUser);

      expect(mockCacheManager.set).toHaveBeenCalledWith(
        expect.stringMatching(/^leaderboard:coach:user-uuid-1:\d{4}-W\d{2}$/),
        expect.anything(),
        expect.any(Number),
      );
    });

    it('recomputes on demand and caches when the weekly job has not populated the key yet', async () => {
      mockCacheManager.get.mockResolvedValue(null);
      mockPredictionQb.getMany.mockResolvedValue(coachFixtureDesc);

      const result = await service.getCoachInsights(coachUser);

      expect(result.has_history).toBe(true);
      expect(mockCacheManager.set).toHaveBeenCalled();
    });

    describe('refreshWeeklyCoachInsights', () => {
      it('refreshes every eligible user into the current week key and clears last week', async () => {
        mockPredictionQb.getRawMany.mockResolvedValue([
          { user_id: 'user-a', resolved_count: '10' },
          { user_id: 'user-b', resolved_count: '7' },
        ]);
        const insightA = { has_history: true, message: null, insights: {} };
        const insightB = { has_history: true, message: null, insights: {} };
        const computeSpy = jest
          .spyOn(service, 'computeCoachInsights')
          .mockResolvedValueOnce(insightA as never)
          .mockResolvedValueOnce(insightB as never);

        const refreshed = await service.refreshWeeklyCoachInsights();

        expect(refreshed).toBe(2);
        expect(computeSpy).toHaveBeenCalledTimes(2);
        expect(computeSpy).toHaveBeenCalledWith(
          expect.objectContaining({ id: 'user-a' }),
        );
        expect(computeSpy).toHaveBeenCalledWith(
          expect.objectContaining({ id: 'user-b' }),
        );

        const setCalls = mockCacheManager.set.mock.calls;
        expect(setCalls).toHaveLength(2);
        for (const [key] of setCalls) {
          expect(String(key)).toMatch(
            /^leaderboard:coach:user-[ab]:\d{4}-W\d{2}$/,
          );
        }
        // Previous-week keys for both users were invalidated.
        const delCalls = mockCacheManager.del.mock.calls.map(([k]) =>
          String(k),
        );
        expect(delCalls).toHaveLength(2);
        for (const key of delCalls) {
          expect(key).toMatch(/^leaderboard:coach:user-(a|b):\d{4}-W\d{2}$/);
        }

        // Current-week keys differ from previous-week keys.
        const setKeys = setCalls.map(([k]) => String(k));
        for (const key of delCalls) {
          expect(setKeys).not.toContain(key);
        }
      });

      it('keeps refreshing remaining users when one computation fails', async () => {
        mockPredictionQb.getRawMany.mockResolvedValue([
          { user_id: 'user-a', resolved_count: '10' },
          { user_id: 'user-b', resolved_count: '7' },
        ]);
        const computeSpy = jest
          .spyOn(service, 'computeCoachInsights')
          .mockRejectedValueOnce(new Error('boom'))
          .mockResolvedValueOnce({
            has_history: true,
            message: null,
            insights: {},
          } as never);

        const refreshed = await service.refreshWeeklyCoachInsights();

        expect(refreshed).toBe(1);
        expect(computeSpy).toHaveBeenCalledTimes(2);
        expect(mockCacheManager.set).toHaveBeenCalledTimes(1);
      });

      it('filters eligibility at query time by the minimum threshold', async () => {
        mockPredictionQb.getRawMany.mockResolvedValue([]);

        await service.refreshWeeklyCoachInsights();

        expect(mockPredictionQb.having).toHaveBeenCalledWith(
          'COUNT(*) >= :minCount',
          { minCount: 5 },
        );
      });
    });

    it('derives ISO week ids deterministically', () => {
      // 2026-01-01 falls in ISO week 1 of 2026; 2025-12-31 also belongs to it.
      expect(
        LeaderboardService.getIsoWeekId(new Date('2026-01-01T00:00:00Z')),
      ).toBe('2026-W01');
      expect(
        LeaderboardService.getIsoWeekId(new Date('2026-08-19T10:00:00Z')),
      ).toBe('2026-W34');
      expect(
        LeaderboardService.getIsoWeekId(new Date('2025-12-31T00:00:00Z')),
      ).toBe('2026-W01');
    });
  });
});
