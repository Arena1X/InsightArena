import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { LeaderboardEntry } from './entities/leaderboard-entry.entity';
import { UsersService } from '../users/users.service';
import {
  LeaderboardQueryDto,
  LeaderboardEntryResponse,
  PaginatedLeaderboardResponse,
} from './dto/leaderboard-query.dto';

@Injectable()
export class LeaderboardService {
  private readonly logger = new Logger(LeaderboardService.name);

  constructor(
    @InjectRepository(LeaderboardEntry)
    private readonly leaderboardRepository: Repository<LeaderboardEntry>,
    private readonly usersService: UsersService,
    private readonly dataSource: DataSource,
  ) {}

  async getLeaderboard(
    query: LeaderboardQueryDto,
  ): Promise<PaginatedLeaderboardResponse> {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const skip = (page - 1) * limit;

    const qb = this.leaderboardRepository
      .createQueryBuilder('entry')
      .leftJoinAndSelect('entry.user', 'user');

    if (query.season_id) {
      qb.where('entry.season_id = :season_id', { season_id: query.season_id });
      qb.orderBy('entry.season_points', 'DESC');
    } else {
      qb.where('entry.season_id IS NULL');
      qb.orderBy('entry.reputation_score', 'DESC');
    }

    qb.addOrderBy('entry.rank', 'ASC').skip(skip).take(limit);

    const [entries, total] = await qb.getManyAndCount();

    const data: LeaderboardEntryResponse[] = entries.map((entry) => {
      const accuracyRate =
        entry.total_predictions > 0
          ? (
              (entry.correct_predictions / entry.total_predictions) *
              100
            ).toFixed(1)
          : '0.0';

      return {
        rank: entry.rank,
        user_id: entry.user_id,
        username: entry.user?.username ?? null,
        stellar_address: entry.user?.stellar_address ?? '',
        reputation_score: entry.reputation_score,
        accuracy_rate: accuracyRate,
        total_winnings_stroops: entry.total_winnings_stroops,
        season_points: entry.season_points,
      };
    });

    return { data, total, page, limit };
  }

  /**
   * Recalculate all leaderboard ranks based on current user stats.
   * Called by the hourly cron job.
   */
  async recalculateRanks(): Promise<void> {
    const start = Date.now();
    this.logger.log('Starting leaderboard rank recalculation...');

    const users = await this.usersService.findAll();

    // Sort users by reputation_score descending for global ranking
    const sorted = [...users].sort(
      (a, b) => b.reputation_score - a.reputation_score,
    );

    await this.dataSource.transaction(async (manager) => {
      for (let i = 0; i < sorted.length; i++) {
        const user = sorted[i];
        const rank = i + 1;

        const existing = await manager
          .createQueryBuilder(LeaderboardEntry, 'entry')
          .where('entry.user_id = :userId AND entry.season_id IS NULL', {
            userId: user.id,
          })
          .getOne();

        if (existing) {
          await manager.update(
            LeaderboardEntry,
            { id: existing.id },
            {
              rank,
              reputation_score: user.reputation_score,
              season_points: user.season_points,
              total_predictions: user.total_predictions,
              correct_predictions: user.correct_predictions,
              total_winnings_stroops: user.total_winnings_stroops,
            },
          );
        } else {
          const entry = manager.create(LeaderboardEntry, {
            user_id: user.id,
            rank,
            reputation_score: user.reputation_score,
            season_points: user.season_points,
            total_predictions: user.total_predictions,
            correct_predictions: user.correct_predictions,
            total_winnings_stroops: user.total_winnings_stroops,
          });
          await manager.save(LeaderboardEntry, entry);
        }
      }
    });

    const elapsed = Date.now() - start;
    this.logger.log(
      `Leaderboard recalculation complete: ${sorted.length} users updated in ${elapsed}ms`,
    );
  }
}
