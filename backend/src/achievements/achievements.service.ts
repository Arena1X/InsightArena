import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Achievement, AchievementType } from './entities/achievement.entity';
import { UserAchievement } from './entities/user-achievement.entity';
import { User } from '../users/entities/user.entity';
import { AchievementResponseDto } from './dto/achievement-response.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/entities/notification.entity';

@Injectable()
export class AchievementsService {
  private readonly logger = new Logger(AchievementsService.name);

  constructor(
    @InjectRepository(Achievement)
    private readonly achievementsRepository: Repository<Achievement>,
    @InjectRepository(UserAchievement)
    private readonly userAchievementsRepository: Repository<UserAchievement>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly notificationsService: NotificationsService,
  ) {}

  async initializeAchievements(): Promise<void> {
    const count = await this.achievementsRepository.count();
    if (count > 0) return;

    const achievements = [
      {
        type: AchievementType.FIRST_PREDICTION,
        title: 'First Step',
        description: 'Make your first prediction',
        reward_points: 10,
        threshold: 1,
      },
      {
        type: AchievementType.CORRECT_PREDICTIONS_10,
        title: 'Rising Star',
        description: 'Get 10 correct predictions',
        reward_points: 50,
        threshold: 10,
      },
      {
        type: AchievementType.CORRECT_PREDICTIONS_50,
        title: 'Seasoned Predictor',
        description: 'Get 50 correct predictions',
        reward_points: 150,
        threshold: 50,
      },
      {
        type: AchievementType.CORRECT_PREDICTIONS_100,
        title: 'Master Predictor',
        description: 'Get 100 correct predictions',
        reward_points: 300,
        threshold: 100,
      },
      {
        type: AchievementType.ACCURACY_75,
        title: 'Accurate Mind',
        description: 'Achieve 75% prediction accuracy',
        reward_points: 100,
        threshold: 75,
      },
      {
        type: AchievementType.ACCURACY_90,
        title: 'Legendary Accuracy',
        description: 'Achieve 90% prediction accuracy',
        reward_points: 250,
        threshold: 90,
      },
      {
        type: AchievementType.TOTAL_STAKED_1M,
        title: 'High Roller',
        description: 'Stake 1,000,000 stroops total',
        reward_points: 75,
        threshold: 1000000,
      },
      {
        type: AchievementType.TOTAL_STAKED_10M,
        title: 'Whale Predictor',
        description: 'Stake 10,000,000 stroops total',
        reward_points: 200,
        threshold: 10000000,
      },
      {
        type: AchievementType.REPUTATION_500,
        title: 'Respected Voice',
        description: 'Reach 500 reputation score',
        reward_points: 100,
        threshold: 500,
      },
      {
        type: AchievementType.REPUTATION_1000,
        title: 'Community Legend',
        description: 'Reach 1000 reputation score',
        reward_points: 300,
        threshold: 1000,
      },
    ];

    for (const achievement of achievements) {
      await this.achievementsRepository.save(achievement);
    }

    this.logger.log(`Initialized ${achievements.length} achievements`);
  }

  async checkAndUnlockAchievements(user: User): Promise<void> {
    const fullUser = await this.usersRepository.findOne({
      where: { id: user.id },
    });

    if (!fullUser) return;

    const achievementsToCheck = [
      {
        type: AchievementType.FIRST_PREDICTION,
        metric: () => fullUser.total_predictions,
        threshold: 1,
      },
      {
        type: AchievementType.CORRECT_PREDICTIONS_10,
        metric: () => fullUser.correct_predictions,
        threshold: 10,
      },
      {
        type: AchievementType.CORRECT_PREDICTIONS_50,
        metric: () => fullUser.correct_predictions,
        threshold: 50,
      },
      {
        type: AchievementType.CORRECT_PREDICTIONS_100,
        metric: () => fullUser.correct_predictions,
        threshold: 100,
      },
      {
        type: AchievementType.ACCURACY_75,
        metric: () =>
          fullUser.total_predictions > 0
            ? (fullUser.correct_predictions / fullUser.total_predictions) * 100
            : 0,
        threshold: 75,
      },
      {
        type: AchievementType.ACCURACY_90,
        metric: () =>
          fullUser.total_predictions > 0
            ? (fullUser.correct_predictions / fullUser.total_predictions) * 100
            : 0,
        threshold: 90,
      },
      {
        type: AchievementType.TOTAL_STAKED_1M,
        metric: () => Number(BigInt(fullUser.total_staked_stroops)),
        threshold: 1000000,
      },
      {
        type: AchievementType.TOTAL_STAKED_10M,
        metric: () => Number(BigInt(fullUser.total_staked_stroops)),
        threshold: 10000000,
      },
      {
        type: AchievementType.REPUTATION_500,
        metric: () => fullUser.reputation_score,
        threshold: 500,
      },
      {
        type: AchievementType.REPUTATION_1000,
        metric: () => fullUser.reputation_score,
        threshold: 1000,
      },
    ];

    for (const { type, metric, threshold } of achievementsToCheck) {
      const value = metric();
      const condition = value >= threshold;

      if (!condition) continue;

      const achievement = await this.achievementsRepository.findOne({
        where: { type },
      });

      if (!achievement) continue;

      const awarded = await this.awardAchievementOnce(user, achievement, value);
      if (awarded) {
        this.logger.log(
          `Unlocked achievement "${achievement.title}" for user ${user.id}`,
        );
        await this.notifyAchievementUnlocked(user, achievement);
      }
    }
  }

  /**
   * Atomically inserts the (user, achievement) unlock row, relying on the
   * UQ_user_achievement DB constraint to guard against concurrent triggers.
   * Returns true only for the call that actually performed the insert, so
   * callers can notify exactly once per new award.
   */
  private async awardAchievementOnce(
    user: User,
    achievement: Achievement,
    currentValue: number,
  ): Promise<boolean> {
    const result = await this.userAchievementsRepository
      .createQueryBuilder()
      .insert()
      .into(UserAchievement)
      .values({
        user: { id: user.id },
        achievement: { id: achievement.id },
        is_unlocked: true,
        current_value: currentValue,
        unlocked_at: new Date(),
      })
      .orIgnore()
      .execute();

    return result.identifiers.length > 0;
  }

  private async notifyAchievementUnlocked(
    user: User,
    achievement: Achievement,
  ): Promise<void> {
    await this.notificationsService.create(
      user.stellar_address,
      NotificationType.AchievementUnlocked,
      'Achievement unlocked',
      `You unlocked "${achievement.title}"`,
      { achievementId: achievement.id, achievementType: achievement.type },
      user.id,
    );
  }

  private getAchievementMetric(
    achievementType: AchievementType,
    user: User,
  ): number {
    switch (achievementType) {
      case AchievementType.FIRST_PREDICTION:
        return user.total_predictions;
      case AchievementType.CORRECT_PREDICTIONS_10:
      case AchievementType.CORRECT_PREDICTIONS_50:
      case AchievementType.CORRECT_PREDICTIONS_100:
        return user.correct_predictions;
      case AchievementType.ACCURACY_75:
      case AchievementType.ACCURACY_90:
        return user.total_predictions > 0
          ? (user.correct_predictions / user.total_predictions) * 100
          : 0;
      case AchievementType.TOTAL_STAKED_1M:
      case AchievementType.TOTAL_STAKED_10M:
        return Number(BigInt(user.total_staked_stroops));
      case AchievementType.REPUTATION_500:
      case AchievementType.REPUTATION_1000:
        return user.reputation_score;
      default:
        return 0;
    }
  }

  private getThreshold(achievementType: AchievementType): number {
    switch (achievementType) {
      case AchievementType.FIRST_PREDICTION:
        return 1;
      case AchievementType.CORRECT_PREDICTIONS_10:
        return 10;
      case AchievementType.CORRECT_PREDICTIONS_50:
        return 50;
      case AchievementType.CORRECT_PREDICTIONS_100:
        return 100;
      case AchievementType.ACCURACY_75:
        return 75;
      case AchievementType.ACCURACY_90:
        return 90;
      case AchievementType.TOTAL_STAKED_1M:
        return 1000000;
      case AchievementType.TOTAL_STAKED_10M:
        return 10000000;
      case AchievementType.REPUTATION_500:
        return 500;
      case AchievementType.REPUTATION_1000:
        return 1000;
      default:
        return 0;
    }
  }

  async getUserAchievements(
    userAddress: string,
  ): Promise<AchievementResponseDto[]> {
    const user = await this.usersRepository.findOne({
      where: { stellar_address: userAddress },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const userAchievements = await this.userAchievementsRepository.find({
      where: { user: { id: user.id } },
      relations: ['achievement'],
    });

    const allAchievements = await this.achievementsRepository.find();

    return allAchievements.map((achievement) => {
      const userAchievement = userAchievements.find(
        (ua) => ua.achievement.id === achievement.id,
      );

      const currentProgress = this.getAchievementMetric(achievement.type, user);
      const threshold = this.getThreshold(achievement.type);
      const percentage =
        threshold > 0
          ? Math.min(100, Math.round((currentProgress / threshold) * 100))
          : 0;
      const isUnlocked = !!userAchievement?.is_unlocked;
      const unlockedAt = userAchievement?.unlocked_at
        ? userAchievement.unlocked_at
        : null;

      const response: AchievementResponseDto = {
        id: achievement.id,
        type: achievement.type,
        title: achievement.title,
        description: achievement.description,
        icon_url: achievement.icon_url,
        reward_points: achievement.reward_points,
        is_unlocked: isUnlocked,
        unlocked_at: unlockedAt,
        progress_percentage: isUnlocked ? 100 : percentage,
        current_progress: currentProgress,
        threshold: threshold,
      };
      return response;
    });
  }

  async updateAchievementProgress(user: User): Promise<void> {
    const achievements = await this.achievementsRepository.find();

    for (const achievement of achievements) {
      const currentProgress = this.getAchievementMetric(achievement.type, user);
      const threshold = this.getThreshold(achievement.type);
      const meetsThreshold = currentProgress >= threshold;

      if (meetsThreshold) {
        // Delegate to the atomic insert-or-ignore guard so concurrent
        // callers can't double-unlock; only the winner notifies.
        const awarded = await this.awardAchievementOnce(
          user,
          achievement,
          currentProgress,
        );
        if (awarded) {
          this.logger.log(
            `Progress unlocked achievement "${achievement.title}" for user ${user.id}`,
          );
          await this.notifyAchievementUnlocked(user, achievement);
        } else {
          await this.userAchievementsRepository.update(
            { user: { id: user.id }, achievement: { id: achievement.id } },
            { current_value: currentProgress },
          );
        }
        continue;
      }

      const existing = await this.userAchievementsRepository.findOne({
        where: { user: { id: user.id }, achievement: { id: achievement.id } },
      });

      if (existing) {
        existing.current_value = currentProgress;
        await this.userAchievementsRepository.save(existing);
      } else {
        await this.userAchievementsRepository
          .createQueryBuilder()
          .insert()
          .into(UserAchievement)
          .values({
            user: { id: user.id },
            achievement: { id: achievement.id },
            is_unlocked: false,
            current_value: currentProgress,
          })
          .orIgnore()
          .execute();
      }
    }
  }

  async getAchievementProgress(
    userAddress: string,
  ): Promise<AchievementResponseDto[]> {
    const user = await this.usersRepository.findOne({
      where: { stellar_address: userAddress },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const allAchievements = await this.achievementsRepository.find();
    const userAchievements = await this.userAchievementsRepository.find({
      where: { user: { id: user.id } },
      relations: ['achievement'],
    });

    return allAchievements.map((achievement) => {
      const userAchievement = userAchievements.find(
        (ua) => ua.achievement.id === achievement.id,
      );

      const currentProgress = this.getAchievementMetric(achievement.type, user);
      const threshold = this.getThreshold(achievement.type);
      const percentage =
        threshold > 0
          ? Math.min(100, Math.round((currentProgress / threshold) * 100))
          : 0;
      const isUnlocked = !!userAchievement?.is_unlocked;
      const unlockedAt = userAchievement?.unlocked_at
        ? userAchievement.unlocked_at
        : null;

      const response: AchievementResponseDto = {
        id: achievement.id,
        type: achievement.type,
        title: achievement.title,
        description: achievement.description,
        icon_url: achievement.icon_url,
        reward_points: achievement.reward_points,
        is_unlocked: isUnlocked,
        unlocked_at: unlockedAt,
        progress_percentage: isUnlocked ? 100 : percentage,
        current_progress: currentProgress,
        threshold: threshold,
      };
      return response;
    });
  }
}
