import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';
import { Prediction } from '../predictions/entities/prediction.entity';
import { Bookmark } from '../bookmarks/entities/bookmark.entity';
import { Follow } from '../follows/entities/follow.entity';
import { Achievement } from '../achievements/entities/achievement.entity';
import { Notification } from '../notifications/entities/notification.entity';

describe('UsersService.gatherUserData', () => {
  let service: UsersService;

  const userRepo = { findOne: jest.fn() };
  const predictionRepo = { find: jest.fn() };
  const bookmarkRepo = { find: jest.fn() };
  const followRepo = { find: jest.fn() };
  const achievementRepo = { find: jest.fn() };
  const notificationRepo = { find: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(Prediction), useValue: predictionRepo },
        { provide: getRepositoryToken(Bookmark), useValue: bookmarkRepo },
        { provide: getRepositoryToken(Follow), useValue: followRepo },
        { provide: getRepositoryToken(Achievement), useValue: achievementRepo },
        { provide: getRepositoryToken(Notification), useValue: notificationRepo },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('includes predictions, bookmarks, and follows in the export payload', async () => {
    const address = 'GUSER1';
    userRepo.findOne.mockResolvedValue({ id: 1, address });
    predictionRepo.find.mockResolvedValue([{ id: 10, userId: 1 }]);
    bookmarkRepo.find.mockResolvedValue([{ id: 20, userId: 1 }]);
    followRepo.find.mockResolvedValue([{ id: 30, followerId: 1 }]);
    achievementRepo.find.mockResolvedValue([]);
    notificationRepo.find.mockResolvedValue([]);

    const result = await service.gatherUserData(address);

    expect(result.predictions).toEqual([{ id: 10, userId: 1 }]);
    expect(result.bookmarks).toEqual([{ id: 20, userId: 1 }]);
    expect(result.follows).toEqual([{ id: 30, followerId: 1 }]);
  });

  it('returns a well-formed empty section for categories with no activity', async () => {
    const address = 'GUSER2';
    userRepo.findOne.mockResolvedValue({ id: 2, address });
    predictionRepo.find.mockResolvedValue([]);
    bookmarkRepo.find.mockResolvedValue([]);
    followRepo.find.mockResolvedValue([]);
    achievementRepo.find.mockResolvedValue([]);
    notificationRepo.find.mockResolvedValue([]);

    const result = await service.gatherUserData(address);

    expect(result).toHaveProperty('predictions');
    expect(result).toHaveProperty('bookmarks');
    expect(result).toHaveProperty('follows');
    expect(result).toHaveProperty('achievements');
    expect(result).toHaveProperty('notifications');
    expect(result.predictions).toEqual([]);
    expect(result.bookmarks).toEqual([]);
    expect(result.follows).toEqual([]);
    expect(result.achievements).toEqual([]);
    expect(result.notifications).toEqual([]);
  });

  it('does not include another user\'s data when queried for a specific address', async () => {
    const address = 'GUSER3';
    userRepo.findOne.mockResolvedValue({ id: 3, address });
    predictionRepo.find.mockResolvedValue([{ id: 31, userId: 3 }]);
    bookmarkRepo.find.mockResolvedValue([]);
    followRepo.find.mockResolvedValue([]);
    achievementRepo.find.mockResolvedValue([]);
    notificationRepo.find.mockResolvedValue([]);

    const result = await service.gatherUserData(address);

    expect(result.predictions).toEqual([{ id: 31, userId: 3 }]);
    expect(result.predictions).not.toContainEqual({ id: 99, userId: 4 });
  });
});
