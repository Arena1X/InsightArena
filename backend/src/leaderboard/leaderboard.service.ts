import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Repository,
  DataSource,
  LessThan,
  IsNull,
  MoreThanOrEqual,
  LessThanOrEqual,
  Between,
  FindOptionsWhere,
} from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Cache } from 'cache-manager';
import { LeaderboardEntry } from './entities/leaderboard-entry.entity';
import { LeaderboardHistory } from './entities/leaderboard-history.entity';
import { LeaderboardSnapshot } from './entities/leaderboard-snapshot.entity';
import { UsersService } from '../users/users.service';
import { User } from '../users/entities/user.entity';
import { Prediction } from '../predictions/entities/prediction.entity';
import {
  CoachAccuracyTrendDto,
  CoachCategoryStatDto,
  CoachInsightPayloadDto,
  CoachInsightsResponse,
} from './dto/coach-insights.dto';
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
import { UserRankDto } from './dto/user-rank.dto';
import {
  RankHistoryQueryDto,
  RankHistoryResponse,
} from './dto/rank-history.dto';
import {
  CursorPaginationDto,
  PaginatedCursorResponse,
} from './dto/cursor-pagination.dto';
import {
  LeaderboardSnapshotQueryDto,
  PaginatedSnapshotRankingResponse,
} from './dto/leaderboard-snapshot-query.dto';
import { CACHE_WARMING_KEYS } from '../cache/cache-warming.keys';
import { SeasonsService } from '../seasons/seasons.service';

/**
 * Minimum number of resolved predictions required before the coach will
 * produce insights. Below this the API returns has_history=false so the
 * frontend can render an onboarding state instead of a broken insight card.
 */
const MIN_RESOLVED_PREDICTIONS_FOR_INSIGHTS = 5;

/** Maximum number of most-recent resolved predictions analysed per user. */
const COACH_ANALYSIS_WINDOW = 30;

/** A category needs at least this many resolved predictions to rank as best/worst. */
const MIN_CATEGORY_PREDICTIONS = 3;

/** Percentage-point change between window halves required to call a trend improving/declining. */
const TREND_CHANGE_THRESHOLD_PP = 10;

/**
 * Structural view of a prediction row joined with its market, used by the
 * pure coach analysis helper so tests can pass plain fixture objects.
 */
type CoachPredictionRow = {
  chosen_outcome: string;
  submitted_at: Date;
  market?: {
    category: string;
    is_resolved: boolean;
    is_cancelled?: boolean;
    resolved_outcome: string | null;
  } | null;
};

@Injectable()
export class LeaderboardService {
  private readonly logger = new Logger(LeaderboardService.name);
  private readonly CACHE_TTL_MS = 1 * 60 * 60 * 1000; // 1 hour

  /** Insights are week-scoped; TTL is only a safety net so nothing lives indefinitely. */
  private readonly COACH_CACHE_TTL_MS = 8 * 24 * 60 * 60 * 1000;

  constructor(
    @InjectRepository(LeaderboardEntry)
    private readonly leaderboardRepository: Repository<LeaderboardEntry>,
    @InjectRepository(LeaderboardHistory)
    private readonly historyRepository: Repository<LeaderboardHistory>,
    @InjectRepository(LeaderboardSnapshot)
    private readonly snapshotRepository: Repository<LeaderboardSnapshot>,
    @InjectRepository(Prediction)
    private readonly predictionRepository: Repository<Prediction>,
    private readonly usersService: UsersService,
    private readonly seasonsService: SeasonsService,
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
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

    const priorRanks = await this.getLatestSnapshotRanks(
      entries.map((entry) => entry.user_id),
      query.season_id,
    );

    const data: LeaderboardEntryResponse[] = entries.map((entry) => {
      const accuracyRate =
        entry.total_predictions > 0
          ? (
              (entry.correct_predictions / entry.total_predictions) *
              100
            ).toFixed(1)
          : '0.0';

      const priorRank = priorRanks.get(entry.user_id);

      return {
        rank: entry.rank,
        user_id: entry.user_id,
        username: entry.user?.username ?? null,
        stellar_address: entry.user?.stellar_address ?? '',
        reputation_score: entry.reputation_score,
        accuracy_rate: accuracyRate,
        total_winnings_stroops: entry.total_winnings_stroops,
        season_points: entry.season_points,
        rank_delta: priorRank !== undefined ? priorRank - entry.rank : null,
      };
    });

    return { data, total, page, limit };
  }

  /**
   * Fetch each user's rank from their most recent snapshot prior to now,
   * scoped to the same season as the query. Users with no snapshot yet are
   * simply absent from the returned map (surfaced as a null rank_delta).
   */
  private async getLatestSnapshotRanks(
    userIds: string[],
    seasonId?: string,
  ): Promise<Map<string, number>> {
    if (userIds.length === 0) {
      return new Map();
    }

    const qb = this.snapshotRepository
      .createQueryBuilder('snap')
      .distinctOn(['snap.user_id'])
      .where('snap.user_id IN (:...userIds)', { userIds })
      .orderBy('snap.user_id')
      .addOrderBy('snap.captured_at', 'DESC');

    if (seasonId) {
      qb.andWhere('snap.season_id = :seasonId', { seasonId });
    } else {
      qb.andWhere('snap.season_id IS NULL');
    }

    const latest = await qb.getMany();
    return new Map(latest.map((snapshot) => [snapshot.user_id, snapshot.rank]));
  }

  async getTopLeaderboard(limit: number): Promise<LeaderboardEntryResponse[]> {
    const season = await this.seasonsService.findActive();
    const cappedLimit = Math.min(limit, 20);

    const [entries] = await this.leaderboardRepository
      .createQueryBuilder('entry')
      .leftJoinAndSelect('entry.user', 'user')
      .where('entry.season_id = :season_id', { season_id: season.id })
      .orderBy('entry.rank', 'ASC')
      .take(cappedLimit)
      .getManyAndCount();

    return entries.map((entry) => ({
      rank: entry.rank,
      user_id: entry.user_id,
      username: entry.user?.username ?? null,
      stellar_address: entry.user?.stellar_address ?? '',
      reputation_score: entry.reputation_score,
      accuracy_rate:
        entry.total_predictions > 0
          ? (
              (entry.correct_predictions / entry.total_predictions) *
              100
            ).toFixed(1)
          : '0.0',
      total_winnings_stroops: entry.total_winnings_stroops,
      season_points: entry.season_points,
    }));
  }

  /**
   * Encodes (score, rank, user_id) into an opaque cursor token. Score is
   * included (not just rank) because the keyset predicate needs it to seek
   * past ties without a DB round-trip to look the cursor row back up.
   */
  private encodeLeaderboardCursor(
    score: number,
    rank: number,
    userId: string,
  ): string {
    return Buffer.from(`${score}:${rank}:${userId}`, 'utf-8').toString(
      'base64',
    );
  }

  private decodeLeaderboardCursor(cursor: string): {
    score: number;
    rank: number;
    userId: string;
  } {
    try {
      const decoded = Buffer.from(cursor, 'base64').toString('utf-8');
      const parts = decoded.split(':');
      if (parts.length !== 3) {
        throw new Error('malformed cursor');
      }
      const [scoreStr, rankStr, userId] = parts;
      const score = Number(scoreStr);
      const rank = parseInt(rankStr, 10);
      if (!userId || Number.isNaN(score) || Number.isNaN(rank)) {
        throw new Error('malformed cursor');
      }
      return { score, rank, userId };
    } catch {
      throw new BadRequestException('Invalid pagination cursor');
    }
  }

  /**
   * Get leaderboard with opaque cursor-based pagination and caching.
   * Cursor encodes (score, rank) as a keyset seek predicate for stable
   * ordering under concurrent score changes.
   */
  async getLeaderboardCursor(
    query: CursorPaginationDto,
  ): Promise<PaginatedCursorResponse> {
    const limit = Math.min(query.limit ?? 20, 100);
    const cacheKey = CACHE_WARMING_KEYS.leaderboardCursor(
      query.season_id ?? null,
      query.cursor ? 1 : 0,
    );

    const cached =
      await this.cacheManager.get<PaginatedCursorResponse>(cacheKey);
    if (cached && !query.cursor) {
      this.logger.debug(`Cache hit for cursor pagination: ${cacheKey}`);
      return cached;
    }

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

    qb.addOrderBy('entry.rank', 'ASC');

    if (query.cursor) {
      const { score, rank } = this.decodeLeaderboardCursor(query.cursor);
      const scoreColumn = query.season_id
        ? 'entry.season_points'
        : 'entry.reputation_score';
      qb.andWhere(
        `(${scoreColumn} < :score OR (${scoreColumn} = :score AND entry.rank > :rank))`,
        { score, rank },
      );
    }

    const entries = await qb.take(limit + 1).getMany();

    const hasMore = entries.length > limit;
    const data = entries.slice(0, limit).map((entry) => {
      const accuracyRate =
        entry.total_predictions > 0
          ? (
              (entry.correct_predictions / entry.total_predictions) *
              100
            ).toFixed(1)
          : '0.0';

      const score = query.season_id
        ? (entry.season_points ?? 0)
        : entry.reputation_score;
      const cursor = this.encodeLeaderboardCursor(
        score,
        entry.rank,
        entry.user_id,
      );

      return {
        rank: entry.rank,
        user_id: entry.user_id,
        username: entry.user?.username ?? null,
        stellar_address: entry.user?.stellar_address ?? '',
        reputation_score: entry.reputation_score,
        accuracy_rate: accuracyRate,
        total_winnings_stroops: entry.total_winnings_stroops,
        season_points: entry.season_points,
        cursor,
      };
    });

    const nextCursor =
      hasMore && data.length > 0 ? data[data.length - 1].cursor : null;
    const result: PaginatedCursorResponse = {
      data,
      nextCursor,
      hasMore,
      limit,
    };

    if (!query.cursor) {
      await this.cacheManager.set(cacheKey, result, this.CACHE_TTL_MS);
      this.logger.debug(`Cached cursor pagination page: ${cacheKey}`);
    }

    return result;
  }

  /**
   * Get top N entries for current season or all-time, lightweight shortcut
   * Capped at 20, served from cache when available for the first page
   */
  async getTopN(
    n: number,
    seasonId?: string,
  ): Promise<LeaderboardEntryResponse[]> {
    const limit = Math.min(n, 20);
    const cacheKey = CACHE_WARMING_KEYS.leaderboardTopN(
      limit,
      seasonId ?? null,
    );

    const cached =
      await this.cacheManager.get<LeaderboardEntryResponse[]>(cacheKey);
    if (cached) {
      this.logger.debug(`Cache hit for top ${limit}: ${cacheKey}`);
      return cached;
    }

    const qb = this.leaderboardRepository
      .createQueryBuilder('entry')
      .leftJoinAndSelect('entry.user', 'user');

    if (seasonId) {
      qb.where('entry.season_id = :seasonId', { seasonId });
      qb.orderBy('entry.season_points', 'DESC');
    } else {
      qb.where('entry.season_id IS NULL');
      qb.orderBy('entry.reputation_score', 'DESC');
    }

    qb.addOrderBy('entry.rank', 'ASC').take(limit);

    const entries = await qb.getMany();

    const data = entries.map((entry) => {
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

    await this.cacheManager.set(cacheKey, data, this.CACHE_TTL_MS);
    this.logger.debug(`Cached top ${limit} leaderboard: ${cacheKey}`);

    return data;
  }

  /**
   * Invalidate all cached leaderboard cursor pages for a season
   */
  private async invalidateLeaderboardCache(seasonId?: string): Promise<void> {
    try {
      const season = seasonId ?? 'all';
      const pageKeys = ['page:0', 'page:1'];

      let invalidatedCount = 0;
      for (const pageKey of pageKeys) {
        const key = `leaderboard:cursor:${season}:${pageKey}`;
        await this.cacheManager.del(key);
        invalidatedCount++;
      }

      if (invalidatedCount > 0) {
        this.logger.log(
          `Invalidated ${invalidatedCount} cached leaderboard pages for season: ${season}`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `Failed to invalidate leaderboard cache: ${error instanceof Error ? error.message : error}`,
      );
    }
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

    await this.invalidateLeaderboardCache();
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
   * Get user rank and stats by stellar address
   * Returns 404 if user has no leaderboard entry
   */
  async getUserRank(stellarAddress: string): Promise<UserRankDto> {
    let user: User | undefined;
    try {
      user = await this.usersService.findByAddress(stellarAddress);
    } catch {
      throw new NotFoundException(
        `User with address "${stellarAddress}" not found`,
      );
    }

    const entry = await this.leaderboardRepository.findOne({
      where: { user_id: user.id, season_id: IsNull() },
    });

    if (!entry) {
      throw new NotFoundException(
        `No leaderboard entry found for user "${stellarAddress}"`,
      );
    }

    const accuracyRate =
      entry.total_predictions > 0
        ? ((entry.correct_predictions / entry.total_predictions) * 100).toFixed(
            1,
          )
        : '0.0';

    return {
      rank: entry.rank,
      reputation_score: entry.reputation_score,
      season_points: entry.season_points,
      total_predictions: entry.total_predictions,
      correct_predictions: entry.correct_predictions,
      accuracy_rate: accuracyRate,
      total_winnings_stroops: entry.total_winnings_stroops,
    };
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

  /**
   * Get user history snapshots for a specific Stellar address
   */
  async getHistoryForAddress(address: string, days: number = 30) {
    const validDays = Math.min(Math.max(days || 30, 1), 90);

    const user = await this.usersService.findByAddress(address);
    if (!user) {
      throw new NotFoundException(`User with address ${address} not found`);
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - validDays);

    const history = await this.historyRepository.find({
      where: {
        user_id: user.id,
        snapshot_date: MoreThanOrEqual(cutoffDate),
      },
      order: { snapshot_date: 'DESC' },
    });

    return history.map((h) => ({
      snapshot_date: h.snapshot_date,
      rank: h.rank,
      reputation_score: h.reputation_score,
      season_points: h.season_points,
    }));
  }

  /**
   * Persist a rank/score snapshot for every current leaderboard entry
   * (all-time and per-season). Called on the configurable snapshot cadence.
   */
  async createRankSnapshot(): Promise<void> {
    const start = Date.now();
    const capturedAt = new Date();

    const entries = await this.leaderboardRepository.find();
    if (entries.length === 0) {
      return;
    }

    const snapshots = entries.map((entry) =>
      this.snapshotRepository.create({
        user_id: entry.user_id,
        season_id: entry.season_id ?? null,
        captured_at: capturedAt,
        rank: entry.rank,
        score: entry.season_id ? entry.season_points : entry.reputation_score,
      }),
    );

    await this.snapshotRepository.save(snapshots);

    const elapsed = Date.now() - start;
    this.logger.log(
      `Leaderboard rank snapshot complete: ${snapshots.length} entries saved in ${elapsed}ms`,
    );
  }

  /**
   * Delete rank snapshots older than the configured retention window.
   */
  async pruneSnapshots(): Promise<void> {
    const retentionDays = this.configService.get<number>(
      'LEADERBOARD_SNAPSHOT_RETENTION_DAYS',
      30,
    );
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    const { affected } = await this.snapshotRepository.delete({
      captured_at: LessThan(cutoff),
    });

    if (affected) {
      this.logger.log(
        `Pruned ${affected} leaderboard snapshot(s) older than ${retentionDays}d`,
      );
    }
  }

  /**
   * Return the leaderboard ranking as of the nearest snapshot on or before the
   * requested date. If the date falls before all stored snapshots the endpoint
   * returns a clear message instead of an empty list so callers know the
   * data is outside the retention window.
   */
  async getSnapshots(
    query: LeaderboardSnapshotQueryDto,
  ): Promise<PaginatedSnapshotRankingResponse> {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const skip = (page - 1) * limit;
    const requestedDate = new Date(query.date);
    requestedDate.setHours(23, 59, 59, 999);

    // Find the most recent snapshot at or before the requested date
    const qb = this.snapshotRepository
      .createQueryBuilder('snap')
      .leftJoinAndSelect('snap.user', 'user')
      .where('snap.captured_at <= :requestedDate', { requestedDate })
      .orderBy('snap.captured_at', 'DESC')
      .take(1);

    if (query.season_id) {
      qb.andWhere('snap.season_id = :season_id', {
        season_id: query.season_id,
      });
    } else {
      qb.andWhere('snap.season_id IS NULL');
    }

    const latestSnapshot = await qb.getOne();

    if (!latestSnapshot) {
      const retentionDays = this.configService.get<number>(
        'LEADERBOARD_SNAPSHOT_RETENTION_DAYS',
        30,
      );
      return {
        data: [],
        snapshot_date: requestedDate,
        total: 0,
        page,
        limit,
        message: `No snapshots found on or before ${query.date}. Snapshots are retained for ${retentionDays} days.`,
      };
    }

    const snapshotDate = latestSnapshot.captured_at;

    // Fetch all rankings from that snapshot
    const rankQb = this.snapshotRepository
      .createQueryBuilder('snap')
      .leftJoinAndSelect('snap.user', 'user')
      .where('snap.captured_at = :snapshotDate', { snapshotDate })
      .orderBy('snap.rank', 'ASC');

    if (query.season_id) {
      rankQb.andWhere('snap.season_id = :season_id', {
        season_id: query.season_id,
      });
    } else {
      rankQb.andWhere('snap.season_id IS NULL');
    }

    const [entries, total] = await rankQb
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    const data = entries.map((entry) => ({
      rank: entry.rank,
      user_id: entry.user_id,
      username: entry.user?.username ?? null,
      stellar_address: entry.user?.stellar_address ?? '',
      score: entry.score,
      captured_at: entry.captured_at,
    }));

    return { data, snapshot_date: snapshotDate, total, page, limit };
  }

  /**
   * Get a user's rank/score history over a time range. rank_delta is the
   * signed change vs. the previous point in the range (null for the first).
   */
  async getRankHistory(
    address: string,
    query: RankHistoryQueryDto,
  ): Promise<RankHistoryResponse> {
    const user = await this.usersService.findByAddress(address);
    if (!user) {
      throw new NotFoundException(`User with address ${address} not found`);
    }

    const where: FindOptionsWhere<LeaderboardSnapshot> = {
      user_id: user.id,
      season_id: query.season_id ?? IsNull(),
    };

    if (query.from && query.to) {
      where.captured_at = Between(new Date(query.from), new Date(query.to));
    } else if (query.from) {
      where.captured_at = MoreThanOrEqual(new Date(query.from));
    } else if (query.to) {
      where.captured_at = LessThanOrEqual(new Date(query.to));
    }

    const snapshots = await this.snapshotRepository.find({
      where,
      order: { captured_at: 'ASC' },
    });

    let previousRank: number | null = null;
    const data = snapshots.map((snapshot) => {
      const rankDelta =
        previousRank !== null ? previousRank - snapshot.rank : null;
      previousRank = snapshot.rank;

      return {
        captured_at: snapshot.captured_at,
        rank: snapshot.rank,
        score: snapshot.score,
        rank_delta: rankDelta,
      };
    });

    return { user_id: user.id, data };
  }

  /**
   * Returns the personalised coach insights for a user, served from the
   * per-user, ISO-week-scoped cache when available. On a cache miss (new
   * user, weekly job not yet run, or previous failure) it computes on demand
   * and populates the cache rather than erroring.
   */
  async getCoachInsights(user: User): Promise<CoachInsightsResponse> {
    const weekId = LeaderboardService.getIsoWeekId(new Date());
    const cacheKey = CACHE_WARMING_KEYS.coachInsights(user.id, weekId);

    const cached = await this.cacheManager.get<CoachInsightsResponse>(cacheKey);
    if (cached) {
      this.logger.debug(`Cache hit for coach insights: ${cacheKey}`);
      return cached;
    }

    const result = await this.computeCoachInsights(user);
    await this.cacheManager.set(cacheKey, result, this.COACH_CACHE_TTL_MS);
    this.logger.debug(`Cached coach insights for user ${user.id} (${weekId})`);

    return result;
  }

  /**
   * Fetches the user's recent resolved predictions and derives the insight
   * payload. Public so the scheduler and tests can invoke it directly; the
   * request-time path is getCoachInsights which wraps it with caching.
   */
  async computeCoachInsights(user: User): Promise<CoachInsightsResponse> {
    const predictions = await this.predictionRepository
      .createQueryBuilder('prediction')
      .leftJoinAndSelect('prediction.market', 'market')
      .where('prediction.userId = :userId', { userId: user.id })
      .andWhere('market.is_resolved = :isResolved', { isResolved: true })
      .andWhere('market.is_cancelled = :isCancelled', { isCancelled: false })
      .orderBy('prediction.submitted_at', 'DESC')
      .take(COACH_ANALYSIS_WINDOW)
      .getMany();

    return LeaderboardService.analyzePredictionHistory(predictions);
  }

  /**
   * Pure derivation of coach insights from resolved prediction history.
   * Rows must be ordered most-recent-first (submitted_at DESC), mirroring the
   * query in computeCoachInsights. Correctness follows the platform-wide rule:
   * a prediction is correct when market.resolved_outcome === chosen_outcome.
   */
  static analyzePredictionHistory(
    predictions: CoachPredictionRow[],
  ): CoachInsightsResponse {
    const resolved = (predictions ?? []).filter(
      (
        p,
      ): p is CoachPredictionRow & {
        market: NonNullable<CoachPredictionRow['market']>;
      } =>
        !!p.market &&
        p.market.is_resolved &&
        !p.market.is_cancelled &&
        p.market.resolved_outcome !== null &&
        p.market.resolved_outcome !== undefined,
    );

    if (resolved.length < MIN_RESOLVED_PREDICTIONS_FOR_INSIGHTS) {
      return {
        has_history: false,
        message:
          'Make a few more predictions to unlock your personalised coach insights.',
        insights: null,
      };
    }

    // Chronological order (oldest -> newest) for trend and streak math.
    const chronological = [...resolved].reverse();

    const correctness = chronological.map((p) => ({
      correct: p.market.resolved_outcome === p.chosen_outcome,
      category: p.market.category,
    }));

    const accuracy_trend = LeaderboardService.computeAccuracyTrend(correctness);
    const { best_category, worst_category } =
      LeaderboardService.computeCategoryStats(correctness);
    const { current_streak, longest_streak } =
      LeaderboardService.computeStreaks(correctness);

    const insights: CoachInsightPayloadDto = {
      accuracy_trend,
      best_category,
      worst_category,
      current_streak,
      longest_streak,
      total_resolved: correctness.length,
      generated_at: new Date().toISOString(),
    };

    return { has_history: true, message: null, insights };
  }

  /**
   * Compares accuracy over the newer half of the window vs the older half.
   * The change must exceed TREND_CHANGE_THRESHOLD_PP percentage points to
   * count as improving/declining; anything else is steady.
   */
  private static computeAccuracyTrend(
    correctness: { correct: boolean; category: string }[],
  ): CoachAccuracyTrendDto {
    const halfIndex = Math.floor(correctness.length / 2);
    const prior = correctness.slice(0, halfIndex);
    const recent = correctness.slice(halfIndex);

    const rate = (rows: { correct: boolean }[]): number =>
      rows.length === 0
        ? 0
        : Math.round(
            (rows.filter((r) => r.correct).length / rows.length) * 100,
          );

    const priorAccuracy = rate(prior);
    const recentAccuracy = rate(recent);
    const delta = recentAccuracy - priorAccuracy;

    let direction: CoachAccuracyTrendDto['direction'];
    if (prior.length === 0 || recent.length === 0) {
      direction = 'not_enough_data';
    } else if (delta > TREND_CHANGE_THRESHOLD_PP) {
      direction = 'improving';
    } else if (delta < -TREND_CHANGE_THRESHOLD_PP) {
      direction = 'declining';
    } else {
      direction = 'steady';
    }

    return {
      direction,
      recent_accuracy: recentAccuracy,
      prior_accuracy: priorAccuracy,
    };
  }

  /**
   * Ranks categories by accuracy within the analysed window. Only categories
   * with at least MIN_CATEGORY_PREDICTIONS resolved predictions qualify.
   */
  private static computeCategoryStats(
    correctness: {
      correct: boolean;
      category: string;
    }[],
  ): {
    best_category: CoachCategoryStatDto | null;
    worst_category: CoachCategoryStatDto | null;
  } {
    const grouped = new Map<string, { total: number; correct: number }>();
    for (const entry of correctness) {
      const stats = grouped.get(entry.category) ?? { total: 0, correct: 0 };
      stats.total += 1;
      if (entry.correct) stats.correct += 1;
      grouped.set(entry.category, stats);
    }

    const qualified: CoachCategoryStatDto[] = [];
    for (const [category, stats] of grouped) {
      if (stats.total < MIN_CATEGORY_PREDICTIONS) continue;
      qualified.push({
        category,
        predictions: stats.total,
        correct: stats.correct,
        accuracy_rate: ((stats.correct / stats.total) * 100).toFixed(1),
      });
    }

    if (qualified.length === 0) {
      return { best_category: null, worst_category: null };
    }

    const sortByAccuracyThenVolume = (
      a: CoachCategoryStatDto,
      b: CoachCategoryStatDto,
    ): number => {
      const accuracyA = parseFloat(a.accuracy_rate);
      const accuracyB = parseFloat(b.accuracy_rate);
      if (accuracyB !== accuracyA) return accuracyB - accuracyA;
      if (b.predictions !== a.predictions) return b.predictions - a.predictions;
      return a.category.localeCompare(b.category);
    };

    const sorted = [...qualified].sort(sortByAccuracyThenVolume);

    return {
      best_category: sorted[0],
      worst_category: sorted[sorted.length - 1],
    };
  }

  /** Current (trailing) and longest run of consecutive correct predictions. */
  private static computeStreaks(
    correctness: {
      correct: boolean;
    }[],
  ): { current_streak: number; longest_streak: number } {
    let current = 0;
    let longest = 0;

    for (const entry of correctness) {
      if (entry.correct) {
        current += 1;
        longest = Math.max(longest, current);
      } else {
        current = 0;
      }
    }
    // `correctness` ends at the most recent prediction, so `current` already
    // represents the trailing streak.

    return { current_streak: current, longest_streak: longest };
  }

  /**
   * Recomputes and re-caches insights for every eligible user under the
   * current ISO-week key and deletes their previous-week keys so nothing
   * stale survives the weekly refresh. Called by the Monday cron job; the
   * request-time path recomputes on demand for anyone the job missed.
   */
  async refreshWeeklyCoachInsights(): Promise<number> {
    const start = Date.now();
    this.logger.log('Refreshing weekly coach insights...');

    const rows = await this.predictionRepository
      .createQueryBuilder('prediction')
      .select('prediction.userId', 'user_id')
      .addSelect('COUNT(*)', 'resolved_count')
      .innerJoin('prediction.market', 'market')
      .where('market.is_resolved = :isResolved', { isResolved: true })
      .andWhere('market.is_cancelled = :isCancelled', { isCancelled: false })
      .groupBy('prediction.userId')
      .having('COUNT(*) >= :minCount', {
        minCount: MIN_RESOLVED_PREDICTIONS_FOR_INSIGHTS,
      })
      .getRawMany<{ user_id: string; resolved_count: string }>();

    const now = new Date();
    const currentWeekId = LeaderboardService.getIsoWeekId(now);
    const previousWeekId = LeaderboardService.getIsoWeekId(
      new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
    );

    let refreshed = 0;
    for (const row of rows) {
      try {
        await this.cacheManager.del(
          CACHE_WARMING_KEYS.coachInsights(row.user_id, previousWeekId),
        );
        const insights = await this.computeCoachInsights({
          id: row.user_id,
        } as User);
        await this.cacheManager.set(
          CACHE_WARMING_KEYS.coachInsights(row.user_id, currentWeekId),
          insights,
          this.COACH_CACHE_TTL_MS,
        );
        refreshed++;
      } catch (error) {
        this.logger.warn(
          `Failed to refresh coach insights for user ${row.user_id}: ${error instanceof Error ? error.message : error}`,
        );
      }
    }

    this.logger.log(
      `Weekly coach insights refreshed for ${refreshed}/${rows.length} users in ${Date.now() - start}ms`,
    );
    return refreshed;
  }

  /** ISO-8601 week identifier, e.g. "2026-W34", used to scope cache entries. */
  static getIsoWeekId(date: Date): string {
    const d = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    );
    const dayNumber = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNumber);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil(
      ((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
    );
    return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
  }
}
