import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Achievement, AchievementType } from './entities/achievement.entity';
import { UserAchievement } from './entities/user-achievement.entity';
import { User } from '../users/entities/user.entity';
import { AchievementResponseDto } from './dto/achievement-response.dto';

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
      },
      {
        type: AchievementType.CORRECT_PREDICTIONS_10,
        title: 'Rising Star',
        description: 'Get 10 correct predictions',
        reward_points: 50,
      },
      {
        type: AchievementType.CORRECT_PREDICTIONS_50,
        title: 'Seasoned Predictor',
        description: 'Get 50 correct predictions',
        reward_points: 150,
      },
      {
        type: AchievementType.CORRECT_PREDICTIONS_100,
        title: 'Master Predictor',
        description: 'Get 100 correct predictions',
        reward_points: 300,
      },
      {
        type: AchievementType.ACCURACY_75,
        title: 'Accurate Mind',
        description: 'Achieve 75% prediction accuracy',
        reward_points: 100,
      },
      {
        type: AchievementType.ACCURACY_90,
        title: 'Legendary Accuracy',
        description: 'Achieve 90% prediction accuracy',
        reward_points: 250,
      },
      {
        type: AchievementType.TOTAL_STAKED_1M,
        title: 'High Roller',
        description: 'Stake 1,000,000 stroops total',
        reward_points: 75,
      },
      {
        type: AchievementType.TOTAL_STAKED_10M,
        title: 'Whale Predictor',
        description: 'Stake 10,000,000 stroops total',
        reward_points: 200,
      },
      {
        type: AchievementType.REPUTATION_500,
        title: 'Respected Voice',
        description: 'Reach 500 reputation score',
        reward_points: 100,
      },
      {
        type: AchievementType.REPUTATION_1000,
        title: 'Community Legend',
        description: 'Reach 1000 reputation score',
        reward_points: 300,
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
        condition: fullUser.total_predictions >= 1,
      },
      {
        type: AchievementType.CORRECT_PREDICTIONS_10,
        condition: fullUser.correct_predictions >= 10,
      },
      {
        type: AchievementType.CORRECT_PREDICTIONS_50,
        condition: fullUser.correct_predictions >= 50,
      },
      {
        type: AchievementType.CORRECT_PREDICTIONS_100,
        condition: fullUser.correct_predictions >= 100,
      },
      {
        type: AchievementType.ACCURACY_75,
        condition:
          fullUser.total_predictions > 0 &&
          (fullUser.correct_predictions / fullUser.total_predictions) * 100 >=
            75,
      },
      {
        type: AchievementType.ACCURACY_90,
        condition:
          fullUser.total_predictions > 0 &&
          (fullUser.correct_predictions / fullUser.total_predictions) * 100 >=
            90,
      },
      {
        type: AchievementType.TOTAL_STAKED_1M,
        condition: BigInt(fullUser.total_staked_stroops) >= BigInt(1000000),
      },
      {
        type: AchievementType.TOTAL_STAKED_10M,
        condition: BigInt(fullUser.total_staked_stroops) >= BigInt(10000000),
      },
      {
        type: AchievementType.REPUTATION_500,
        condition: fullUser.reputation_score >= 500,
      },
      {
        type: AchievementType.REPUTATION_1000,
        condition: fullUser.reputation_score >= 1000,
      },
    ];

    for (const { type, condition } of achievementsToCheck) {
      if (!condition) continue;

      const achievement = await this.achievementsRepository.findOne({
        where: { type },
      });

      if (!achievement) continue;

      const existing = await this.userAchievementsRepository.findOne({
        where: { user: { id: user.id }, achievement: { id: achievement.id } },
      });

      if (!existing) {
        await this.userAchievementsRepository.save({
          user,
          achievement,
          is_unlocked: true,
          unlocked_at: new Date(),
        });

        this.logger.log(
          `Unlocked achievement "${achievement.title}" for user ${user.id}`,
        );
      }
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

      return {
        id: achievement.id,
        type: achievement.type,
        title: achievement.title,
        description: achievement.description,
        icon_url: achievement.icon_url,
        reward_points: achievement.reward_points,
        is_unlocked: !!userAchievement?.is_unlocked,
        unlocked_at: userAchievement?.unlocked_at || null,
      };
    });
  }
}
