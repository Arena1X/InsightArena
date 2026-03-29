import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, LessThan } from 'typeorm';
import { LeaderboardEntry } from './entities/leaderboard-entry.entity';
import { LeaderboardHistory } from './entities/leaderboard-history.entity';
import { UsersService } from '../users/users.service';
import {
  LeaderboardQueryDto,
  LeaderboardEntryResponse,
  PaginatedLeaderboardResponse,
} from './dto/leaderboard-query.dto';
import {
  LeaderboardHistoryQueryDto,
  LeaderboardHistoryEntryResponse,
  PaginatedLeaderboardHistoryResponse,
} from './dto/leaderboard-history.dto';

@Injectable()
export class LeaderboardService {
  private readonly logger = new Logger(LeaderboardService.name);

  constructor(
    @InjectRepository(LeaderboardEntry)
    private readonly leaderboardRepository: Repository<LeaderboardEntry>,
    @InjectRepository(LeaderboardHistory)
    private readonly historyRepository: Repository<LeaderboardHistory>,
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

  /**
   * Get historical leaderboard rankings with optional filters
   */
  async getHistory(
    query: LeaderboardHistoryQueryDto,
  ): Promise<PaginatedLeaderboardHistoryResponse> {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const skip = (page - 1) * limit;

    const qb = this.historyRepository
      .createQueryBuilder('history')
      .leftJoinAndSelect('history.user', 'user');

    if (query.date) {
      qb.where('history.snapshot_date = :date', { date: query.date });
    }

    if (query.season_id) {
      qb.andWhere('history.season_id = :season_id', {
        season_id: query.season_id,
      });
    } else if (!query.date) {
      qb.andWhere('history.season_id IS NULL');
    }

    if (query.user_id) {
      qb.andWhere('history.user_id = :user_id', { user_id: query.user_id });
    }

    qb.orderBy('history.snapshot_date', 'DESC')
      .addOrderBy('history.rank', 'ASC')
      .skip(skip)
      .take(limit);

    const [entries, total] = await qb.getManyAndCount();

    const data: LeaderboardHistoryEntryResponse[] = await Promise.all(
      entries.map(async (entry) => {
        const accuracyRate =
          entry.total_predictions > 0
            ? (
                (entry.correct_predictions / entry.total_predictions) *
                100
              ).toFixed(1)
            : '0.0';

        // Calculate rank change if user_id is specified
        let rankChange: number | null = null;
        if (query.user_id) {
          const previousEntry = await this.historyRepository.findOne({
            where: {
              user_id: entry.user_id,
              snapshot_date: LessThan(entry.snapshot_date),
              season_id: entry.season_id ?? undefined,
            },
            order: { snapshot_date: 'DESC' },
          });

          if (previousEntry) {
            rankChange = previousEntry.rank - entry.rank;
          }
        }

        return {
          rank: entry.rank,
          user_id: entry.user_id,
          username: entry.user?.username ?? null,
          stellar_address: entry.user?.stellar_address ?? '',
          reputation_score: entry.reputation_score,
          accuracy_rate: accuracyRate,
          total_winnings_stroops: entry.total_winnings_stroops,
          season_points: entry.season_points,
          snapshot_date: entry.snapshot_date,
          rank_change: rankChange,
        };
      }),
    );

    return { data, total, page, limit };
  }

  /**
   * Create daily snapshot of current leaderboard
   * Called by the daily cron job
   */
  async createDailySnapshot(): Promise<void> {
    const start = Date.now();
    this.logger.log('Creating daily leaderboard snapshot...');

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const entries = await this.leaderboardRepository.find({
      relations: ['user'],
    });

    await this.dataSource.transaction(async (manager) => {
      for (const entry of entries) {
        const existing = await manager.findOne(LeaderboardHistory, {
          where: {
            user_id: entry.user_id,
            snapshot_date: today,
            season_id: entry.season_id ?? undefined,
          },
        });

        if (!existing) {
          const history = manager.create(LeaderboardHistory, {
            user_id: entry.user_id,
            snapshot_date: today,
            rank: entry.rank,
            reputation_score: entry.reputation_score,
            season_points: entry.season_points,
            total_predictions: entry.total_predictions,
            correct_predictions: entry.correct_predictions,
            total_winnings_stroops: entry.total_winnings_stroops,
            season_id: entry.season_id ?? undefined,
          });
          await manager.save(LeaderboardHistory, history);
        }
      }
    });

    const elapsed = Date.now() - start;
    this.logger.log(
      `Daily snapshot complete: ${entries.length} entries saved in ${elapsed}ms`,
    );
  }
}
