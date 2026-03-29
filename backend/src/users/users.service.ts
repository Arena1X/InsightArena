import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Prediction } from '../predictions/entities/prediction.entity';
import {
  ListUserPredictionsDto,
  PaginatedPublicUserPredictionsResponse,
  PublicPredictionOutcomeFilter,
  PublicUserPredictionItem,
} from './dto/list-user-predictions.dto';
import { User } from './entities/user.entity';
import { UpdateUserDto } from './dto/update-user.dto';

import { CompetitionParticipant } from '../competitions/entities/competition-participant.entity';
import {
  ListUserCompetitionsDto,
  UserCompetitionFilterStatus,
} from './dto/list-user-competitions.dto';
import { Market } from '../markets/entities/market.entity';
import { LeaderboardEntry } from '../leaderboard/entities/leaderboard-entry.entity';
import { UserStatsDto } from './dto/user-stats.dto';

const USER_STATS_CACHE_TTL_MS = 60_000;
const PREDICTION_HISTORY_DAYS = 365;

type StatsCacheEntry = { expiresAt: number; stats: UserStatsDto };

@Injectable()
export class UsersService {
  private readonly statsCache = new Map<string, StatsCacheEntry>();

  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(Prediction)
    private readonly predictionsRepository: Repository<Prediction>,

    @InjectRepository(CompetitionParticipant)
    private readonly participantsRepository: Repository<CompetitionParticipant>,
    @InjectRepository(Market)
    private readonly marketsRepository: Repository<Market>,
    @InjectRepository(LeaderboardEntry)
    private readonly leaderboardRepository: Repository<LeaderboardEntry>,
  ) {}

  async findAll(): Promise<User[]> {
    return this.usersRepository.find();
  }

  async findById(id: string): Promise<User> {
    const user = await this.usersRepository.findOneBy({ id });
    if (!user) {
      throw new NotFoundException(`User with id ${id} not found`);
    }
    return user;
  }

  async findByAddress(stellar_address: string): Promise<User> {
    const user = await this.usersRepository.findOneBy({ stellar_address });
    if (!user) {
      throw new NotFoundException(
        `User with address ${stellar_address} not found`,
      );
    }
    return user;
  }

  async findPublicPredictionsByAddress(
    stellar_address: string,
    dto: ListUserPredictionsDto,
  ): Promise<PaginatedPublicUserPredictionsResponse> {
    const user = await this.findByAddress(stellar_address);

    const page = dto.page ?? 1;
    const limit = Math.min(dto.limit ?? 20, 50);
    const skip = (page - 1) * limit;

    const qb = this.predictionsRepository
      .createQueryBuilder('prediction')
      .leftJoinAndSelect('prediction.market', 'market')
      .where('prediction.userId = :userId', { userId: user.id })
      .andWhere('market.is_resolved = true')
      .orderBy('prediction.submitted_at', 'DESC')
      .skip(skip)
      .take(limit);

    const [predictions, total] = await qb.getManyAndCount();

    const data = predictions
      .map((prediction) => this.mapPublicPrediction(prediction))
      .filter((prediction) => {
        if (!dto.outcome) return true;
        return prediction.outcome === dto.outcome;
      });

    return { data, total, page, limit };
  }

  private mapPublicPrediction(
    prediction: Prediction,
  ): PublicUserPredictionItem {
    const outcome = this.computePublicOutcome(prediction);

    return {
      id: prediction.id,
      chosen_outcome: prediction.chosen_outcome,
      stake_amount_stroops: prediction.stake_amount_stroops,
      payout_claimed: prediction.payout_claimed,
      payout_amount_stroops: prediction.payout_amount_stroops,
      tx_hash: prediction.tx_hash ?? null,
      submitted_at: prediction.submitted_at,
      outcome,
      market: {
        id: prediction.market.id,
        title: prediction.market.title,
        end_time: prediction.market.end_time,
        resolved_outcome: prediction.market.resolved_outcome ?? null,
        is_resolved: prediction.market.is_resolved,
        is_cancelled: prediction.market.is_cancelled,
      },
    };
  }

  private computePublicOutcome(
    prediction: Prediction,
  ): PublicPredictionOutcomeFilter {
    if (prediction.market.resolved_outcome == null) {
      return PublicPredictionOutcomeFilter.Pending;
    }

    if (prediction.market.resolved_outcome === prediction.chosen_outcome) {
      return PublicPredictionOutcomeFilter.Correct;
    }

    return PublicPredictionOutcomeFilter.Incorrect;
  }

  async updateProfile(userId: string, dto: UpdateUserDto): Promise<User> {
    const user = await this.findById(userId);
    const cacheKey = user.stellar_address;

    if (dto.username !== undefined) {
      user.username = dto.username;
    }
    if (dto.avatar_url !== undefined) {
      user.avatar_url = dto.avatar_url;
    }

    const saved = await this.usersRepository.save(user);
    this.statsCache.delete(cacheKey);
    return saved;
  }

  async findUserCompetitions(address: string, dto: ListUserCompetitionsDto) {
    const user = await this.findByAddress(address);
    const { page = 1, limit = 20, status } = dto;
    const skip = (page - 1) * limit;
    const now = new Date();

    const qb = this.participantsRepository
      .createQueryBuilder('participant')
      .leftJoinAndSelect('participant.competition', 'competition')
      .where('participant.user_id = :userId', { userId: user.id });

    if (status === UserCompetitionFilterStatus.Active) {
      qb.andWhere('competition.end_time >= :now', { now });
    } else if (status === UserCompetitionFilterStatus.Completed) {
      qb.andWhere('competition.end_time < :now', { now });
    }

    const [items, total] = await qb
      .orderBy('competition.end_time', 'DESC')
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    const data = items.map((p) => ({
      id: p.competition.id,
      title: p.competition.title,
      rank: p.rank,
      score: p.score,
      end_time: p.competition.end_time,
      status: p.competition.end_time < now ? 'completed' : 'active',
    }));

    return { data, total, page, limit };
  }

  async getPublicStatsByAddress(stellar_address: string): Promise<UserStatsDto> {
    const cached = this.statsCache.get(stellar_address);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.stats;
    }

    const user = await this.findByAddress(stellar_address);

    const now = new Date();
    const historySince = new Date(now);
    historySince.setUTCDate(historySince.getUTCDate() - PREDICTION_HISTORY_DAYS);

    const [
      leaderboardEntry,
      marketsCreated,
      competitionsJoined,
      competitionsWon,
      favoriteCategoryRows,
      predictionHistoryRows,
    ] = await Promise.all([
      this.leaderboardRepository.findOne({
        where: { user_id: user.id, season_id: IsNull() },
      }),
      this.marketsRepository.count({ where: { creator: { id: user.id } } }),
      this.participantsRepository.count({
        where: { user_id: user.id },
      }),
      this.participantsRepository
        .createQueryBuilder('participant')
        .innerJoin('participant.competition', 'competition')
        .where('participant.user_id = :userId', { userId: user.id })
        .andWhere('participant.rank = :rank', { rank: 1 })
        .andWhere('competition.end_time < :now', { now })
        .getCount(),
      this.predictionsRepository
        .createQueryBuilder('prediction')
        .innerJoin('prediction.market', 'market')
        .select('market.category', 'category')
        .addSelect('COUNT(*)', 'cnt')
        .where('prediction.userId = :userId', { userId: user.id })
        .groupBy('market.category')
        .orderBy('cnt', 'DESC')
        .limit(5)
        .getRawMany<{ category: string }>(),
      this.predictionsRepository
        .createQueryBuilder('prediction')
        .select("to_char(prediction.submitted_at, 'YYYY-MM-DD')", 'date')
        .addSelect('COUNT(*)', 'count')
        .where('prediction.userId = :userId', { userId: user.id })
        .andWhere('prediction.submitted_at >= :since', { since: historySince })
        .groupBy("to_char(prediction.submitted_at, 'YYYY-MM-DD')")
        .orderBy('date', 'DESC')
        .limit(PREDICTION_HISTORY_DAYS)
        .getRawMany<{ date: string; count: string }>(),
    ]);

    const totalPredictions = user.total_predictions;
    const correctPredictions = user.correct_predictions;
    const accuracyRate =
      totalPredictions === 0
        ? 0
        : Math.round((correctPredictions / totalPredictions) * 10000) / 100;

    const staked = BigInt(user.total_staked_stroops || '0');
    const winnings = BigInt(user.total_winnings_stroops || '0');
    const netProfit = (winnings - staked).toString();

    const stats: UserStatsDto = {
      total_predictions: totalPredictions,
      correct_predictions: correctPredictions,
      accuracy_rate: accuracyRate,
      total_staked_stroops: user.total_staked_stroops,
      total_winnings_stroops: user.total_winnings_stroops,
      net_profit_stroops: netProfit,
      reputation_score: user.reputation_score,
      season_points: user.season_points,
      rank: leaderboardEntry?.rank ?? 0,
      markets_created: marketsCreated,
      competitions_joined: competitionsJoined,
      competitions_won: competitionsWon,
      favorite_categories: favoriteCategoryRows.map((r) => r.category),
      prediction_history: predictionHistoryRows.map((r) => ({
        date: r.date,
        count: parseInt(r.count, 10),
      })),
    };

    this.statsCache.set(stellar_address, {
      expiresAt: Date.now() + USER_STATS_CACHE_TTL_MS,
      stats,
    });

    return stats;
  }
}
