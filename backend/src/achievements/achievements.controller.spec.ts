import { Test, TestingModule } from '@nestjs/testing';
import { AchievementsController } from './achievements.controller';
import { AchievementsService } from './achievements.service';
import { AchievementType } from './entities/achievement.entity';
import { User } from '../users/entities/user.entity';

describe('AchievementsController', () => {
  let controller: AchievementsController;
  let service: jest.Mocked<AchievementsService>;

  const mockUser = {
    id: 'user-1',
    stellar_address: 'GABC123',
  } as User;

  const mockAchievements = [
    {
      id: 'ach-1',
      type: AchievementType.FIRST_PREDICTION,
      title: 'First Step',
      description: 'Make your first prediction',
      icon_url: null,
      reward_points: 10,
      is_unlocked: true,
      unlocked_at: new Date(),
      progress_percentage: 100,
      current_progress: 1,
      threshold: 1,
    },
    {
      id: 'ach-2',
      type: AchievementType.CORRECT_PREDICTIONS_10,
      title: 'Rising Star',
      description: 'Get 10 correct predictions',
      icon_url: null,
      reward_points: 50,
      is_unlocked: false,
      unlocked_at: null,
      progress_percentage: 0,
      current_progress: 0,
      threshold: 10,
    },
  ];

  const mockProgress = [
    {
      id: 'ach-1',
      type: AchievementType.FIRST_PREDICTION,
      title: 'First Step',
      description: 'Make your first prediction',
      icon_url: null,
      reward_points: 10,
      is_unlocked: true,
      unlocked_at: new Date(),
      progress_percentage: 100,
      current_progress: 1,
      threshold: 1,
    },
    {
      id: 'ach-2',
      type: AchievementType.CORRECT_PREDICTIONS_10,
      title: 'Rising Star',
      description: 'Get 10 correct predictions',
      icon_url: null,
      reward_points: 50,
      is_unlocked: false,
      unlocked_at: null,
      progress_percentage: 30,
      current_progress: 3,
      threshold: 10,
    },
  ];

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AchievementsController],
      providers: [
        {
          provide: AchievementsService,
          useValue: {
            getUserAchievements: jest.fn(),
            getAchievementProgress: jest.fn(),
            checkAndUnlockAchievements: jest.fn(),
            updateAchievementProgress: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<AchievementsController>(AchievementsController);
    service = module.get(AchievementsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getUserAchievements', () => {
    it('should return all achievements for a user', async () => {
      service.getUserAchievements.mockResolvedValue(mockAchievements);

      const result = await controller.getUserAchievements('GABC123');

      expect(result).toEqual(mockAchievements);
      expect(service.getUserAchievements).toHaveBeenCalledWith('GABC123');
    });

    it('should trigger checkAndUnlockAchievements when user views own profile', async () => {
      service.getUserAchievements.mockResolvedValue(mockAchievements);
      service.checkAndUnlockAchievements.mockResolvedValue(undefined);
      service.updateAchievementProgress.mockResolvedValue(undefined);

      await controller.getUserAchievements('GABC123', mockUser);

      expect(service.checkAndUnlockAchievements).toHaveBeenCalledWith(mockUser);
      expect(service.updateAchievementProgress).toHaveBeenCalledWith(mockUser);
      expect(service.getUserAchievements).toHaveBeenCalledWith('GABC123');
    });

    it('should not trigger checkAndUnlockAchievements when viewing other user profile', async () => {
      service.getUserAchievements.mockResolvedValue(mockAchievements);

      await controller.getUserAchievements('GOTHER123', mockUser);

      expect(service.checkAndUnlockAchievements).not.toHaveBeenCalled();
      expect(service.getUserAchievements).toHaveBeenCalledWith('GOTHER123');
    });

    it('should handle unauthenticated requests', async () => {
      service.getUserAchievements.mockResolvedValue(mockAchievements);

      const result = await controller.getUserAchievements('GABC123');

      expect(result).toEqual(mockAchievements);
      expect(service.checkAndUnlockAchievements).not.toHaveBeenCalled();
    });
  });

  describe('getAchievementProgress', () => {
    it('should return achievement progress for a user', async () => {
      service.getAchievementProgress.mockResolvedValue(mockProgress);

      const result = await controller.getAchievementProgress('GABC123');

      expect(result).toEqual(mockProgress);
      expect(service.getAchievementProgress).toHaveBeenCalledWith('GABC123');
    });

    it('should trigger updateAchievementProgress when viewing own profile', async () => {
      service.getAchievementProgress.mockResolvedValue(mockProgress);
      service.updateAchievementProgress.mockResolvedValue(undefined);

      await controller.getAchievementProgress('GABC123', mockUser);

      expect(service.updateAchievementProgress).toHaveBeenCalledWith(mockUser);
      expect(service.getAchievementProgress).toHaveBeenCalledWith('GABC123');
    });

    it('should return progress with percentage for unearned achievements', async () => {
      service.getAchievementProgress.mockResolvedValue(mockProgress);

      const result = await controller.getAchievementProgress('GOTHER123');

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result[0].progress_percentage).toBe(100);
      expect(result[1].progress_percentage).toBe(30);
    });
  });
});
