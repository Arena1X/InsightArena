import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AchievementsService } from './achievements.service';
import { Achievement, AchievementType } from './entities/achievement.entity';
import { UserAchievement } from './entities/user-achievement.entity';
import { User } from '../users/entities/user.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/entities/notification.entity';
import { NotificationBroadcasterService } from '../websocket/notification-broadcaster.service';

describe('AchievementsService', () => {
  let service: AchievementsService;
  let achievementsRepository: jest.Mocked<Repository<Achievement>>;
  let userAchievementsRepository: jest.Mocked<Repository<UserAchievement>>;
  let usersRepository: jest.Mocked<Repository<User>>;
  let notificationsService: jest.Mocked<NotificationsService>;
  let notificationBroadcaster: jest.Mocked<NotificationBroadcasterService>;

  const mockUser = {
    id: 'user-1',
    stellar_address: 'GABC123',
    total_predictions: 10,
    correct_predictions: 9,
    total_staked_stroops: '5000000',
    reputation_score: 600,
  } as User;

  /**
   * Simulates a Postgres unique-constraint-backed `INSERT ... ON CONFLICT DO
   * NOTHING`: the first insert for a given (user, achievement) key succeeds
   * (returns an identifier), every subsequent insert for the same key is
   * ignored (returns no identifiers) — regardless of call order, which is
   * what lets us model concurrent triggers racing each other.
   */
  const makeInsertOrIgnoreMock = (userAchievementsRepo: any) => {
    const awardedKeys = new Set<string>();
    userAchievementsRepo.createQueryBuilder.mockImplementation(() => {
      let values: any;
      const qb = {
        insert: () => qb,
        into: () => qb,
        values: (v: any) => {
          values = v;
          return qb;
        },
        orIgnore: () => qb,
        execute: async () => {
          const key = `${values.user.id}:${values.achievement.id}`;
          if (awardedKeys.has(key)) {
            return { identifiers: [], raw: [] };
          }
          awardedKeys.add(key);
          return { identifiers: [{ id: `ua-${key}` }], raw: [] };
        },
      };
      return qb;
    });
    return awardedKeys;
  };

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
      update: jest.fn(),
      createQueryBuilder: jest.fn(),
    } as any;

    usersRepository = {
      findOne: jest.fn().mockResolvedValue(mockUser),
    } as any;

    notificationsService = {
      create: jest.fn().mockResolvedValue({}),
    } as any;

    notificationBroadcaster = {
      broadcastAchievementUnlocked: jest.fn(),
      broadcastAchievementProgress: jest.fn(),
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
        {
          provide: NotificationsService,
          useValue: notificationsService,
        },
        {
          provide: NotificationBroadcasterService,
          useValue: notificationBroadcaster,
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
    makeInsertOrIgnoreMock(userAchievementsRepository);

    await service.checkAndUnlockAchievements(mockUser);

    expect(userAchievementsRepository.createQueryBuilder).toHaveBeenCalled();
    expect(notificationsService.create).toHaveBeenCalledWith(
      mockUser.stellar_address,
      NotificationType.AchievementUnlocked,
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ achievementId: mockAchievement.id }),
      mockUser.id,
    );
    expect(
      notificationBroadcaster.broadcastAchievementUnlocked,
    ).toHaveBeenCalledWith(
      mockUser.stellar_address,
      expect.objectContaining({ achievement_id: mockAchievement.id }),
    );
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

  describe('awardAchievementOnce concurrency guard', () => {
    const achievement = {
      id: 'ach-once',
      type: AchievementType.FIRST_PREDICTION,
      title: 'First Step',
    } as Achievement;

    beforeEach(() => {
      achievementsRepository.findOne.mockResolvedValue(achievement);
    });

    it('awards exactly one record when two calls race for the same user/achievement', async () => {
      const awardedKeys = makeInsertOrIgnoreMock(userAchievementsRepository);

      await Promise.all([
        service.awardAchievementOnce(mockUser, achievement),
        service.awardAchievementOnce(mockUser, achievement),
      ]);

      expect(awardedKeys.size).toBe(1);
      expect(awardedKeys.has(`${mockUser.id}:${achievement.id}`)).toBe(true);
    });

    it('sends only one achievement-unlocked notification despite the concurrent race', async () => {
      makeInsertOrIgnoreMock(userAchievementsRepository);

      await Promise.all([
        service.awardAchievementOnce(mockUser, achievement),
        service.awardAchievementOnce(mockUser, achievement),
      ]);

      expect(notificationsService.create).toHaveBeenCalledTimes(1);
      expect(notificationsService.create).toHaveBeenCalledWith(
        mockUser.stellar_address,
        NotificationType.AchievementUnlocked,
        expect.any(String),
        expect.any(String),
        expect.objectContaining({ achievementId: achievement.id }),
        mockUser.id,
      );
      expect(
        notificationBroadcaster.broadcastAchievementUnlocked,
      ).toHaveBeenCalledTimes(1);
    });

    it('awards a genuinely new achievement not yet awarded to the user', async () => {
      const awardedKeys = makeInsertOrIgnoreMock(userAchievementsRepository);

      await service.awardAchievementOnce(mockUser, achievement);

      expect(awardedKeys.has(`${mockUser.id}:${achievement.id}`)).toBe(true);
      expect(notificationsService.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('accuracy achievement boundary tests', () => {
    const makeUser = (correct: number, total: number) =>
      ({
        id: 'user-1',
        stellar_address: 'GABC123',
        total_predictions: total,
        correct_predictions: correct,
        total_staked_stroops: '0',
        reputation_score: 0,
      }) as User;

    beforeEach(() => {
      achievementsRepository.findOne.mockImplementation((options: any) => {
        const type = options?.where?.type;
        return Promise.resolve({ id: `ach-${type}`, type } as Achievement);
      });
      makeInsertOrIgnoreMock(userAchievementsRepository);
    });

    const unlockedTypes = () =>
      notificationsService.create.mock.calls.map(
        (call) => (call[4] as any)?.achievementType,
      );

    it('should NOT unlock ACCURACY_75 at 74% accuracy (below boundary)', async () => {
      usersRepository.findOne.mockResolvedValue(makeUser(74, 100));
      await service.checkAndUnlockAchievements(makeUser(74, 100));
      expect(unlockedTypes()).not.toContain(AchievementType.ACCURACY_75);
    });

    it('should unlock ACCURACY_75 at exactly 75% accuracy', async () => {
      usersRepository.findOne.mockResolvedValue(makeUser(75, 100));
      await service.checkAndUnlockAchievements(makeUser(75, 100));
      expect(unlockedTypes()).toContain(AchievementType.ACCURACY_75);
    });

    it('should NOT unlock ACCURACY_90 at 89% accuracy (below boundary)', async () => {
      usersRepository.findOne.mockResolvedValue(makeUser(89, 100));
      await service.checkAndUnlockAchievements(makeUser(89, 100));
      expect(unlockedTypes()).not.toContain(AchievementType.ACCURACY_90);
    });

    it('should unlock ACCURACY_90 at exactly 90% accuracy', async () => {
      usersRepository.findOne.mockResolvedValue(makeUser(90, 100));
      await service.checkAndUnlockAchievements(makeUser(90, 100));
      expect(unlockedTypes()).toContain(AchievementType.ACCURACY_90);
    });

    it('should NOT unlock any accuracy achievement when total_predictions is 0', async () => {
      usersRepository.findOne.mockResolvedValue(makeUser(0, 0));
      await service.checkAndUnlockAchievements(makeUser(0, 0));
      expect(unlockedTypes()).not.toContain(AchievementType.ACCURACY_75);
      expect(unlockedTypes()).not.toContain(AchievementType.ACCURACY_90);
    });
  });

  describe('monotonic progress and award-once semantics (#1951)', () => {
    const achievement: Achievement = {
      id: 'ach-pred-10',
      type: AchievementType.CORRECT_PREDICTIONS_10,
      title: 'Rising Star',
      description: 'Get 10 correct predictions',
      threshold: 10,
      reward_points: 50,
      icon_url: 'star.png',
      created_at: new Date(),
      updated_at: new Date(),
    };

    beforeEach(() => {
      userAchievementsRepository.save.mockImplementation(async (entity: any) => ({
        id: entity.id ?? 'ua-1',
        ...entity,
      }));
      userAchievementsRepository.create.mockImplementation((entity: any) => ({
        id: 'ua-1',
        ...entity,
      }));
    });

    it('out-of-order events never decrease progress', async () => {
      // User currently has progress of 7
      const existing: UserAchievement = {
        id: 'ua-1',
        userId: mockUser.id,
        achievementId: achievement.id,
        user: mockUser,
        achievement,
        is_unlocked: false,
        current_value: 7,
        unlocked_at: null,
      };
      userAchievementsRepository.findOne.mockResolvedValue(existing);

      // An out-of-order event arrives reporting an older value of 4
      const result = await service.recordProgress(mockUser, achievement, 4);

      expect(result.userAchievement.current_value).toBe(7);
      expect(result.awarded).toBe(false);
      expect(notificationsService.create).not.toHaveBeenCalled();
    });

    it('crossing a threshold awards exactly once', async () => {
      const existing: UserAchievement = {
        id: 'ua-1',
        userId: mockUser.id,
        achievementId: achievement.id,
        user: mockUser,
        achievement,
        is_unlocked: false,
        current_value: 8,
        unlocked_at: null,
      };
      userAchievementsRepository.findOne.mockResolvedValue(existing);

      // Value reaches 10, crossing the threshold
      const result = await service.recordProgress(mockUser, achievement, 10);

      expect(result.awarded).toBe(true);
      expect(result.userAchievement.is_unlocked).toBe(true);
      expect(result.userAchievement.current_value).toBe(10);
      expect(notificationsService.create).toHaveBeenCalledTimes(1);
      expect(
        notificationBroadcaster.broadcastAchievementUnlocked,
      ).toHaveBeenCalledTimes(1);
    });

    it('replayed events do not double-award an achievement', async () => {
      const unlockedDate = new Date('2026-05-01');
      const alreadyUnlocked: UserAchievement = {
        id: 'ua-1',
        userId: mockUser.id,
        achievementId: achievement.id,
        user: mockUser,
        achievement,
        is_unlocked: true,
        current_value: 10,
        unlocked_at: unlockedDate,
      };
      userAchievementsRepository.findOne.mockResolvedValue(alreadyUnlocked);

      // Replayed event with threshold value 10
      const result1 = await service.recordProgress(mockUser, achievement, 10);
      expect(result1.awarded).toBe(false);
      expect(notificationsService.create).not.toHaveBeenCalled();

      // Another replayed event with higher value 12
      const result2 = await service.recordProgress(mockUser, achievement, 12);
      expect(result2.awarded).toBe(false);
      expect(result2.userAchievement.current_value).toBe(12);
      expect(notificationsService.create).not.toHaveBeenCalled();
    });
  });
});
