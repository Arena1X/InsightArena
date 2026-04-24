import { Test, TestingModule } from '@nestjs/testing';
import { AchievementsController } from './achievements.controller.ts';
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
            checkAndUnlockAchievements: jest.fn(),
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

      await controller.getUserAchievements('GABC123', mockUser);

      expect(service.checkAndUnlockAchievements).toHaveBeenCalledWith(mockUser);
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
});
