import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AchievementsService } from './achievements.service';
import { Achievement, AchievementType } from './entities/achievement.entity';
import { UserAchievement } from './entities/user-achievement.entity';
import { User } from '../users/entities/user.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/entities/notification.entity';

describe('AchievementsService', () => {
  let service: AchievementsService;
  let achievementsRepository: jest.Mocked<Repository<Achievement>>;
  let userAchievementsRepository: jest.Mocked<Repository<UserAchievement>>;
  let usersRepository: jest.Mocked<Repository<User>>;
  let notificationsService: jest.Mocked<NotificationsService>;

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

  describe('TOTAL_STAKED achievement boundary tests', () => {
    const makeStakeUser = (total_staked_stroops: string) =>
      ({
        id: 'user-1',
        stellar_address: 'GABC123',
        total_predictions: 0,
        correct_predictions: 0,
        total_staked_stroops,
        reputation_score: 0,
      }) as User;

    beforeEach(() => {
      achievementsRepository.findOne.mockImplementation((options: any) => {
        const type = options?.where?.type;
        return Promise.resolve({ id: `ach-${type}`, type } as Achievement);
      });
    });

    const unlockedTypes = () =>
      notificationsService.create.mock.calls.map(
        (call) => (call[4] as any)?.achievementType,
      );

    it('should NOT unlock TOTAL_STAKED_1M when staked is 999999 (just below 1M)', async () => {
      makeInsertOrIgnoreMock(userAchievementsRepository);
      const user = makeStakeUser('999999');
      usersRepository.findOne.mockResolvedValue(user);
      await service.checkAndUnlockAchievements(user);
      expect(unlockedTypes()).not.toContain(AchievementType.TOTAL_STAKED_1M);
    });

    it('should unlock TOTAL_STAKED_1M when staked is exactly 1000000', async () => {
      makeInsertOrIgnoreMock(userAchievementsRepository);
      const user = makeStakeUser('1000000');
      usersRepository.findOne.mockResolvedValue(user);
      await service.checkAndUnlockAchievements(user);
      expect(unlockedTypes()).toContain(AchievementType.TOTAL_STAKED_1M);
    });

    it('should NOT re-notify TOTAL_STAKED_1M once already awarded', async () => {
      const user = makeStakeUser('9999999');
      usersRepository.findOne.mockResolvedValue(user);
      const awardedKeys = makeInsertOrIgnoreMock(userAchievementsRepository);
      awardedKeys.add(`${user.id}:ach-${AchievementType.TOTAL_STAKED_1M}`);

      await service.checkAndUnlockAchievements(user);

      expect(unlockedTypes()).not.toContain(AchievementType.TOTAL_STAKED_10M);
      expect(unlockedTypes()).not.toContain(AchievementType.TOTAL_STAKED_1M);
    });

    it('should unlock only TOTAL_STAKED_10M when staked is exactly 10000000 and TOTAL_STAKED_1M already unlocked', async () => {
      const user = makeStakeUser('10000000');
      usersRepository.findOne.mockResolvedValue(user);
      const awardedKeys = makeInsertOrIgnoreMock(userAchievementsRepository);
      awardedKeys.add(`${user.id}:ach-${AchievementType.TOTAL_STAKED_1M}`);

      await service.checkAndUnlockAchievements(user);

      expect(unlockedTypes()).toContain(AchievementType.TOTAL_STAKED_10M);
      expect(unlockedTypes()).not.toContain(AchievementType.TOTAL_STAKED_1M);
    });
  });

  describe('idempotency: one award per (user, achievement) under concurrent triggers', () => {
    const qualifyingUser = {
      id: 'user-1',
      stellar_address: 'GABC123',
      total_predictions: 1,
      correct_predictions: 0,
      total_staked_stroops: '0',
      reputation_score: 0,
    } as User;

    const firstPredictionAchievement = {
      id: 'ach-first-prediction',
      type: AchievementType.FIRST_PREDICTION,
      title: 'First Step',
    } as Achievement;

    beforeEach(() => {
      usersRepository.findOne.mockResolvedValue(qualifyingUser);
      achievementsRepository.findOne.mockResolvedValue(
        firstPredictionAchievement,
      );
    });

    it('awards exactly once and notifies exactly once when two concurrent triggers race', async () => {
      makeInsertOrIgnoreMock(userAchievementsRepository);

      // Simulate two concurrent triggers (e.g. two predictions resolving
      // near-simultaneously) both racing to unlock the same achievement.
      await Promise.all([
        service.checkAndUnlockAchievements(qualifyingUser),
        service.checkAndUnlockAchievements(qualifyingUser),
      ]);

      expect(notificationsService.create).toHaveBeenCalledTimes(1);
    });

    it('awards exactly once and notifies exactly once across many concurrent triggers', async () => {
      makeInsertOrIgnoreMock(userAchievementsRepository);

      await Promise.all(
        Array.from({ length: 10 }, () =>
          service.checkAndUnlockAchievements(qualifyingUser),
        ),
      );

      expect(notificationsService.create).toHaveBeenCalledTimes(1);
    });

    it('does not re-notify on a second sequential call once already awarded', async () => {
      makeInsertOrIgnoreMock(userAchievementsRepository);

      await service.checkAndUnlockAchievements(qualifyingUser);
      await service.checkAndUnlockAchievements(qualifyingUser);

      expect(notificationsService.create).toHaveBeenCalledTimes(1);
    });

    it('updateAchievementProgress also awards at most once under concurrent calls', async () => {
      achievementsRepository.find.mockResolvedValue([
        firstPredictionAchievement,
      ]);
      makeInsertOrIgnoreMock(userAchievementsRepository);

      await Promise.all([
        service.updateAchievementProgress(qualifyingUser),
        service.updateAchievementProgress(qualifyingUser),
      ]);

      expect(notificationsService.create).toHaveBeenCalledTimes(1);
    });
  });
});
