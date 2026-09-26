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
