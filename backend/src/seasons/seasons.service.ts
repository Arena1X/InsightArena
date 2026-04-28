import {
  BadRequestException,
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
import { CreateSeasonDto } from './dto/create-season.dto';
import {
  ListSeasonsDto,
  PaginatedSeasonsResponse,
  SeasonListItemDto,
  SeasonTopWinnerDto,
} from './dto/list-seasons.dto';
import { SorobanService } from '../soroban/soroban.service';

@Injectable()
export class SeasonsService {
  private readonly logger = new Logger(SeasonsService.name);

  constructor(
    @InjectRepository(Season)
    private readonly seasonsRepository: Repository<Season>,
    private readonly sorobanService: SorobanService,
    private readonly notificationsService: NotificationsService,
    private readonly dataSource: DataSource,
  ) {}

  async findAllPaginated(
    query: ListSeasonsDto,
  ): Promise<PaginatedSeasonsResponse> {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 50);
    const skip = (page - 1) * limit;

    const qb = this.seasonsRepository
      .createQueryBuilder('season')
      .leftJoinAndSelect('season.top_winner', 'winner')
      .orderBy('season.season_number', 'DESC')
      .skip(skip)
      .take(limit);

    const [rows, total] = await qb.getManyAndCount();

    return {
      data: rows.map((s) => this.toSeasonListItem(s)),
      total,
      page,
      limit,
    };
  }

  private toSeasonListItem(season: Season): SeasonListItemDto {
    const tw = season.top_winner;
    const top_winner: SeasonTopWinnerDto | null =
      season.is_finalized && tw
        ? {
            user_id: tw.id,
            username: tw.username,
            stellar_address: tw.stellar_address,
          }
        : null;

    return {
      id: season.id,
      season_number: season.season_number,
      name: season.name,
      starts_at: season.starts_at,
      ends_at: season.ends_at,
      reward_pool_stroops: String(season.reward_pool_stroops),
      is_active: season.is_active,
      is_finalized: season.is_finalized,
      on_chain_season_id: season.on_chain_season_id,
      soroban_tx_hash: season.soroban_tx_hash,
      created_at: season.created_at,
      updated_at: season.updated_at,
      top_winner,
    };
  }

  /**
   * The single season marked `is_active` whose window contains now
   * (`starts_at <= now < ends_at`). If multiple match (data anomaly), returns
   * the row with the latest `starts_at`.
   */
  async findActive(): Promise<Season> {
    const now = new Date();
    const season = await this.seasonsRepository
      .createQueryBuilder('s')
      .where('s.is_active = :act', { act: true })
      .andWhere('s.starts_at <= :now', { now })
      .andWhere('s.ends_at > :now', { now })
      .orderBy('s.starts_at', 'DESC')
      .getOne();

    if (!season) {
      throw new NotFoundException(
        'No active season exists. There is no season that is marked active and whose start and end times include the current moment.',
      );
    }

    return season;
  }

  async create(dto: CreateSeasonDto): Promise<Season> {
    const startsAt = new Date(dto.start_time);
    const endsAt = new Date(dto.end_time);

    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
      throw new BadRequestException('Invalid start_time or end_time');
    }
    if (endsAt <= startsAt) {
      throw new BadRequestException('end_time must be after start_time');
    }

    const duplicateNumber = await this.seasonsRepository.exist({
      where: { season_number: dto.season_number },
    });
    if (duplicateNumber) {
      throw new ConflictException(
        `Season number ${dto.season_number} is already in use`,
      );
    }

    const overlapsActive = await this.hasActiveSeasonOverlappingRange(
      startsAt,
      endsAt,
    );
    if (overlapsActive) {
      throw new ConflictException(
        'An active season already exists that overlaps this time range',
      );
    }

    const now = new Date();
    const is_active = startsAt <= now && now < endsAt;

    const entity = this.seasonsRepository.create({
      season_number: dto.season_number,
      name: `Season ${dto.season_number}`,
      starts_at: startsAt,
      ends_at: endsAt,
      reward_pool_stroops: dto.reward_pool_stroops,
      is_active,
      is_finalized: false,
      on_chain_season_id: null,
      soroban_tx_hash: null,
    });

    const saved = await this.seasonsRepository.save(entity);

    if (dto.sync_soroban) {
      const startUnix = Math.floor(startsAt.getTime() / 1000);
      const endUnix = Math.floor(endsAt.getTime() / 1000);
      try {
        const chain = await this.sorobanService.createSeason(
          startUnix,
          endUnix,
          dto.reward_pool_stroops,
        );
        saved.on_chain_season_id = chain.on_chain_season_id;
        saved.soroban_tx_hash = chain.tx_hash;
        await this.seasonsRepository.save(saved);
      } catch (err) {
        await this.seasonsRepository.remove(saved);
        throw err;
      }
    }

    return saved;
  }

  /**
   * True if any season with `is_active` currently true has a time window that
   * intersects [start, end] (starts_at < end && ends_at > start).
   */
  private async hasActiveSeasonOverlappingRange(
    start: Date,
    end: Date,
  ): Promise<boolean> {
    const count = await this.seasonsRepository
      .createQueryBuilder('s')
      .where('s.is_active = :active', { active: true })
      .andWhere('s.starts_at < :end', { end })
      .andWhere('s.ends_at > :start', { start })
      .getCount();
    return count > 0;
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
      season.top_winner = topWinner ?? null;

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
