import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AchievementsService } from './achievements.service';
import { Achievement, AchievementType } from './entities/achievement.entity';
import { UserAchievement } from './entities/user-achievement.entity';
import { User } from '../users/entities/user.entity';

describe('AchievementsService', () => {
  let service: AchievementsService;
  let achievementsRepository: jest.Mocked<Repository<Achievement>>;
  let userAchievementsRepository: jest.Mocked<Repository<UserAchievement>>;
  let usersRepository: jest.Mocked<Repository<User>>;

  const mockUser = {
    id: 'user-1',
    stellar_address: 'GABC123',
    total_predictions: 10,
    correct_predictions: 9,
    total_staked_stroops: '5000000',
    reputation_score: 600,
  } as User;

  beforeEach(async () => {
    achievementsRepository = {
      count: jest.fn().mockResolvedValue(0),
      save: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
    } as any;

    userAchievementsRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(),
    } as any;

    usersRepository = {
      findOne: jest.fn().mockResolvedValue(mockUser),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AchievementsService,
        {
          provide: getRepositoryToken(Achievement),
          useValue: achievementsRepository,
        },
        {
          provide: getRepositoryToken(UserAchievement),
          useValue: userAchievementsRepository,
        },
        {
          provide: getRepositoryToken(User),
          useValue: usersRepository,
        },
      ],
    }).compile();

    service = module.get<AchievementsService>(AchievementsService);
  });

  it('should initialize achievements on first call', async () => {
    await service.initializeAchievements();
    expect(achievementsRepository.save).toHaveBeenCalled();
  });

  it('should check and unlock achievements for user', async () => {
    const mockAchievement = {
      id: 'ach-1',
      type: AchievementType.FIRST_PREDICTION,
      title: 'First Step',
    } as Achievement;

    achievementsRepository.findOne.mockResolvedValue(mockAchievement);
    userAchievementsRepository.findOne.mockResolvedValue(null);

    await service.checkAndUnlockAchievements(mockUser);

    expect(userAchievementsRepository.save).toHaveBeenCalled();
  });

  it('should get user achievements', async () => {
    const mockAchievements = [
      {
        id: 'ach-1',
        type: AchievementType.FIRST_PREDICTION,
        title: 'First Step',
        description: 'Make your first prediction',
        icon_url: null,
        reward_points: 10,
      },
    ] as Achievement[];

    const mockUserAchievements = [
      {
        achievement: mockAchievements[0],
        is_unlocked: true,
        unlocked_at: new Date(),
      },
    ] as UserAchievement[];

    usersRepository.findOne.mockResolvedValue(mockUser);
    userAchievementsRepository.find.mockResolvedValue(mockUserAchievements);
    achievementsRepository.find.mockResolvedValue(mockAchievements);

    const result = await service.getUserAchievements(mockUser.stellar_address);

    expect(result).toHaveLength(1);
    expect(result[0].is_unlocked).toBe(true);
  });
});
