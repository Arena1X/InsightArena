import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Achievement, AchievementType } from './entities/achievement.entity';
import { UserAchievement } from './entities/user-achievement.entity';
import { User } from '../users/entities/user.entity';
import { AchievementResponseDto } from './dto/achievement-response.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/entities/notification.entity';
import { NotificationBroadcasterService } from '../websocket/notification-broadcaster.service';

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
    private readonly notificationBroadcaster: NotificationBroadcasterService,
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
    const unlockedAt = new Date();
    await this.notificationsService.create(
      user.stellar_address,
      NotificationType.AchievementUnlocked,
      'Achievement unlocked',
      `You unlocked "${achievement.title}"`,
      { achievementId: achievement.id, achievementType: achievement.type },
      user.id,
    );

    this.notificationBroadcaster.broadcastAchievementUnlocked(
      user.stellar_address,
      {
        achievement_id: achievement.id,
        type: achievement.type,
        title: achievement.title,
        description: achievement.description,
        icon_url: achievement.icon_url,
        reward_points: achievement.reward_points,
        unlocked_at: unlockedAt,
      },
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

  async getUserAchievements(userId: string): Promise<AchievementResponseDto[]> {
    const userAchievements = await this.userAchievementsRepository.find({
      where: { user: { id: userId } },
      relations: ['achievement'],
      order: { unlocked_at: 'DESC' },
    });

    return userAchievements.map((ua) => ({
      id: ua.achievement.id,
      type: ua.achievement.type,
      title: ua.achievement.title,
      description: ua.achievement.description,
      icon_url: ua.achievement.icon_url,
      reward_points: ua.achievement.reward_points,
      is_unlocked: ua.is_unlocked,
      current_value: ua.current_value,
      unlocked_at: ua.unlocked_at,
    }));
  }

  async getAllAchievements(userId: string): Promise<AchievementResponseDto[]> {
    const achievements = await this.achievementsRepository.find({
      order: { threshold: 'ASC' },
    });

    const userAchievements = await this.userAchievementsRepository.find({
      where: { user: { id: userId } },
      relations: ['achievement'],
    });

    const userAchievementMap = new Map(
      userAchievements.map((ua) => [ua.achievement.id, ua]),
    );

    return achievements.map((achievement) => {
      const userAchievement = userAchievementMap.get(achievement.id);
      return {
        id: achievement.id,
        type: achievement.type,
        title: achievement.title,
        description: achievement.description,
        icon_url: achievement.icon_url,
        reward_points: achievement.reward_points,
        is_unlocked: userAchievement?.is_unlocked ?? false,
        current_value: userAchievement?.current_value ?? 0,
        unlocked_at: userAchievement?.unlocked_at ?? null,
      };
    });
  }
}
