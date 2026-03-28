import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { NotificationType } from '../notifications/entities/notification.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { User } from '../users/entities/user.entity';
import { Season } from './entities/season.entity';

@Injectable()
export class SeasonsService {
  private readonly logger = new Logger(SeasonsService.name);

  constructor(
    @InjectRepository(Season)
    private readonly seasonsRepository: Repository<Season>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly notificationsService: NotificationsService,
    private readonly dataSource: DataSource,
  ) {}

  async findAll(): Promise<Season[]> {
    return this.seasonsRepository.find({
      order: {
        starts_at: 'DESC',
      },
    });
  }

  async findById(id: string): Promise<Season> {
    const season = await this.seasonsRepository.findOne({
      where: { id },
      relations: ['top_winner'],
    });
    if (!season) {
      throw new NotFoundException(`Season "${id}" not found`);
    }
    return season;
  }

  /**
   * Finalize a season:
   * 1. Verify season is not already finalized
   * 2. Find user with highest season_points
   * 3. Mark season as inactive and finalized, set top_winner
   * 4. Reset all users' season_points to 0
   * 5. Create winner notification
   *
   * All operations are executed atomically within a transaction
   */
  async finalizeSeason(seasonId: string): Promise<Season> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Step 1: Verify season exists and is not finalized
      const season = await queryRunner.manager.findOne(Season, {
        where: { id: seasonId },
      });

      if (!season) {
        throw new NotFoundException(`Season "${seasonId}" not found`);
      }

      if (season.is_finalized) {
        throw new ConflictException('Season is already finalized');
      }

      // Step 2: Find user with highest season_points
      const topWinner = await queryRunner.manager.findOne(User, {
        where: {},
        order: { season_points: 'DESC' },
      });

      // Step 3: Update season - mark as inactive, finalized, and set top_winner
      season.is_active = false;
      season.is_finalized = true;
      if (topWinner) {
        season.top_winner_id = topWinner.id;
      }

      await queryRunner.manager.save(Season, season);

      // Step 4: Reset all users' season_points to 0 atomically
      await queryRunner.manager.update(User, {}, { season_points: 0 });

      // Commit transaction before creating notification
      await queryRunner.commitTransaction();

      this.logger.log(
        `Season "${season.id}" finalized. Top winner: ${topWinner?.username || 'N/A'}`,
      );

      // Step 5: Create winner notification (outside transaction)
      if (topWinner) {
        await this.notificationsService.create(
          topWinner.id,
          NotificationType.System,
          '🎉 Season Winner!',
          `Congratulations! You are the winner of the ${season.name} season with the highest points!`,
          {
            season_id: seasonId,
            season_name: season.name,
            winning_points: topWinner.season_points,
          },
        );

        this.logger.log(
          `Winner notification created for user "${topWinner.id}"`,
        );
      }

      // Reload and return the finalized season with relations
      return this.findById(seasonId);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Failed to finalize season "${seasonId}":`, error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
