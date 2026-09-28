import { Test, TestingModule } from '@nestjs/testing';
import { AccountService } from './account.service';
import { UsersService } from '../users/users.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity';
import { Prediction } from '../predictions/entities/prediction.entity';
import { Bookmark } from '../bookmarks/entities/bookmark.entity';
import { Follow } from '../follows/entities/follow.entity';
import { Achievement } from '../achievements/entities/achievement.entity';
import { Notification } from '../notifications/entities/notification.entity';

describe('AccountService — user data export completeness (#1828)', () => {
  let accountService: AccountService;
  let usersService: UsersService;

  const address = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
  const otherAddress = 'GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';

  const user = { id: 'user-1', address } as User;
  const otherUser = { id: 'user-2', address: otherAddress } as User;

  const predictions = [{ id: 'p1', userId: user.id }] as Prediction[];
  const bookmarks = [{ id: 'b1', userId: user.id }] as Bookmark[];
  const follows = [{ id: 'f1', followerId: user.id, followingId: otherUser.id }] as Follow[];
  const achievements = [{ id: 'a1', userId: user.id }] as Achievement[];
  const notifications = [{ id: 'n1', userId: user.id }] as Notification[];

  const userRepository = {
    findOne: jest.fn(async ({ where }: any) =>
      where.address === address ? user : where.address === otherAddress ? otherUser : null,
    ),
  };

  const predictionRepository = {
    find: jest.fn(async ({ where }: any) =>
      where.userId === user.id ? predictions : [],
    ),
  };

  const bookmarkRepository = {
    find: jest.fn(async ({ where }: any) =>
      where.userId === user.id ? bookmarks : [],
    ),
  };

  const followRepository = {
    find: jest.fn(async ({ where }: any) =>
      where.followerId === user.id || where.followingId === user.id ? follows : [],
    ),
  };

  const achievementRepository = {
    find: jest.fn(async ({ where }: any) =>
      where.userId === user.id ? achievements : [],
    ),
  };

  const notificationRepository = {
    find: jest.fn(async ({ where }: any) =>
      where.userId === user.id ? notifications : [],
    ),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountService,
        UsersService,
        { provide: getRepositoryToken(User), useValue: userRepository },
        { provide: getRepositoryToken(Prediction), useValue: predictionRepository },
        { provide: getRepositoryToken(Bookmark), useValue: bookmarkRepository },
        { provide: getRepositoryToken(Follow), useValue: followRepository },
        { provide: getRepositoryToken(Achievement), useValue: achievementRepository },
        { provide: getRepositoryToken(Notification), useValue: notificationRepository },
      ],
    }).compile();

    accountService = module.get<AccountService>(AccountService);
    usersService = module.get<UsersService>(UsersService);
  });

  it('gatherUserData includes predictions, bookmarks, and follows when data exists', async () => {
    const data = await usersService.gatherUserData(address);

    expect(data).toBeDefined();
    expect(data.predictions).toEqual(predictions);
    expect(data.bookmarks).toEqual(bookmarks);
    expect(data.follows).toEqual(follows);
  });

  it('gatherUserData enumerates every related entity type when data exists', async () => {
    const data = await usersService.gatherUserData(address);

    expect(data.predictions).toEqual(predictions);
    expect(data.bookmarks).toEqual(bookmarks);
    expect(data.follows).toEqual(follows);
    expect(data.achievements).toEqual(achievements);
    expect(data.notifications).toEqual(notifications);
  });

  it('gatherUserData returns a well-formed empty section for categories with no activity', async () => {
    const data = await usersService.gatherUserData(otherAddress);

    expect(data).toBeDefined();
    expect(Array.isArray(data.predictions)).toBe(true);
    expect(data.predictions).toEqual([]);
    expect(Array.isArray(data.bookmarks)).toBe(true);
    expect(data.bookmarks).toEqual([]);
    expect(Array.isArray(data.follows)).toBe(true);
    expect(data.follows).toEqual([]);
    expect(Array.isArray(data.achievements)).toBe(true);
    expect(data.achievements).toEqual([]);
    expect(Array.isArray(data.notifications)).toBe(true);
    expect(data.notifications).toEqual([]);
  });

  it('exportUserData does not include another user\'s data when queried for a specific address', async () => {
    const data = await accountService.exportUserData(address);

    expect(data).toBeDefined();
    expect(data.predictions).toEqual(predictions);
    expect(data.bookmarks).toEqual(bookmarks);
    expect(data.follows).toEqual(follows);
    expect(data.achievements).toEqual(achievements);
    expect(data.notifications).toEqual(notifications);

    expect(data.predictions).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ userId: otherUser.id })]),
    );
    expect(data.bookmarks).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ userId: otherUser.id })]),
    );
  });
});

describe('AccountService — account deletion cascade (#1833)', () => {
  let accountService: AccountService;
  let mockDataSource: any;
  let mockJobRepo: any;
  let mockConfigService: any;

  beforeEach(async () => {
    jest.clearAllMocks();

    mockDataSource = {
      transaction: jest.fn(),
      query: jest.fn(),
    };

    mockJobRepo = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
      delete: jest.fn(),
    };

    mockConfigService = {
      get: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountService,
        {
          provide: getRepositoryToken(DataExportJob),
          useValue: mockJobRepo,
        },
        {
          provide: 'DataSource',
          useValue: mockDataSource,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    accountService = module.get<AccountService>(AccountService);
  });

  it('deletes bookmarks, follows, API keys, and notification preferences within the same transaction', async () => {
    const userId = 'user-1';
    const stellarAddress = 'GTESTADDRESS';
    const mockManager = {
      query: jest.fn()
        .mockResolvedValueOnce([{ stellar_address: stellarAddress, deleted_at: null }]) // user check
        .mockResolvedValueOnce([{ file_path: '/exports/test.json' }]) // export jobs
        .mockResolvedValueOnce(undefined) // delete bookmarks
        .mockResolvedValueOnce(undefined) // delete follows (follower)
        .mockResolvedValueOnce(undefined) // delete follows (following)
        .mockResolvedValueOnce(undefined) // delete API keys
        .mockResolvedValueOnce(undefined) // delete notification preferences
        .mockResolvedValueOnce(undefined) // delete notifications
        .mockResolvedValueOnce(undefined) // delete notification digest state
        .mockResolvedValueOnce(undefined) // delete data export jobs
        .mockResolvedValueOnce(undefined), // update users
    };

    mockDataSource.transaction.mockImplementation((callback) => callback(mockManager));

    await accountService.deleteAccount(userId);

    expect(mockManager.query).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM user_bookmarks'),
      [userId]
    );
    expect(mockManager.query).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM user_follows WHERE follower_id'),
      [userId]
    );
    expect(mockManager.query).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM user_follows WHERE following_id'),
      [userId]
    );
    expect(mockManager.query).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM api_keys'),
      [userId]
    );
    expect(mockManager.query).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM notification_preferences'),
      [userId]
    );
  });

  it('is idempotent when called twice for the same already-deleted address', async () => {
    const userId = 'user-1';
    const stellarAddress = 'GTESTADDRESS';
    const mockManager = {
      query: jest.fn()
        .mockResolvedValueOnce([{ stellar_address: stellarAddress, deleted_at: null }]) // first call - not deleted
        .mockResolvedValueOnce([{ file_path: null }]) // export jobs
        .mockResolvedValueOnce(undefined) // delete bookmarks
        .mockResolvedValueOnce(undefined) // delete follows (follower)
        .mockResolvedValueOnce(undefined) // delete follows (following)
        .mockResolvedValueOnce(undefined) // delete API keys
        .mockResolvedValueOnce(undefined) // delete notification preferences
        .mockResolvedValueOnce(undefined) // delete notifications
        .mockResolvedValueOnce(undefined) // delete notification digest state
        .mockResolvedValueOnce(undefined) // delete data export jobs
        .mockResolvedValueOnce(undefined) // update users
        .mockResolvedValueOnce([{ stellar_address: stellarAddress, deleted_at: new Date() }]) // second call - already deleted
    };

    mockDataSource.transaction.mockImplementation((callback) => callback(mockManager));

    // First call - should delete
    await accountService.deleteAccount(userId);

    // Second call - should not throw and return early
    await expect(accountService.deleteAccount(userId)).resolves.not.toThrow();
  });

  it('rolls back transaction if deletion fails partway through', async () => {
    const userId = 'user-1';
    const stellarAddress = 'GTESTADDRESS';
    const mockManager = {
      query: jest.fn()
        .mockResolvedValueOnce([{ stellar_address: stellarAddress, deleted_at: null }]) // user check
        .mockResolvedValueOnce([{ file_path: null }]) // export jobs
        .mockResolvedValueOnce(undefined) // delete bookmarks
        .mockRejectedValueOnce(new Error('Database error')), // delete follows fails
    };

    mockDataSource.transaction.mockImplementation(async (callback) => {
      try {
        await callback(mockManager);
      } catch (error) {
        // Transaction should roll back
        throw error;
      }
    });

    await expect(accountService.deleteAccount(userId)).rejects.toThrow('Database error');

    // Verify that the user was not marked as deleted due to rollback
    expect(mockManager.query).not.toHaveBeenCalledWith(
      expect.stringContaining('UPDATE users'),
      expect.anything()
    );
  });
});

describe('AccountService — export status polling (#1834)', () => {
  let accountService: AccountService;
  let mockJobRepo: any;
  let mockDataSource: any;
  let mockConfigService: any;

  beforeEach(async () => {
    jest.clearAllMocks();

    mockJobRepo = {
      findOne: jest.fn(),
    };

    mockDataSource = {
      transaction: jest.fn(),
    };

    mockConfigService = {
      get: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountService,
        {
          provide: getRepositoryToken(DataExportJob),
          useValue: mockJobRepo,
        },
        {
          provide: 'DataSource',
          useValue: mockDataSource,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    accountService = module.get<AccountService>(AccountService);
  });

  it('returns not-found for a random/nonexistent request ID', async () => {
    const userId = 'user-1';
    const nonexistentJobId = 'nonexistent-uuid';
    mockJobRepo.findOne.mockResolvedValue(null);

    await expect(
      accountService.getExportStatus(userId, nonexistentJobId),
    ).rejects.toThrow(NotFoundException);
  });

  it('rejects request for a valid job ID belonging to a different user', async () => {
    const userId = 'user-1';
    const otherUserId = 'user-2';
    const jobId = 'valid-job-uuid';
    
    mockJobRepo.findOne.mockResolvedValue({
      id: jobId,
      user_id: otherUserId,
      status: 'ready',
      expires_at: new Date(),
    });

    await expect(
      accountService.getExportStatus(userId, jobId),
    ).rejects.toThrow(NotFoundException);
  });

  it('returns correct status for a valid in-progress request of the caller', async () => {
    const userId = 'user-1';
    const jobId = 'valid-job-uuid';
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
    
    mockJobRepo.findOne.mockResolvedValue({
      id: jobId,
      user_id: userId,
      status: 'processing',
      expires_at: expiresAt,
    });

    const result = await accountService.getExportStatus(userId, jobId);

    expect(result).toEqual({
      jobId: jobId,
      status: 'processing',
      expires_at: expiresAt,
    });
  });
});
