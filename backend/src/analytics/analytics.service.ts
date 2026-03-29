import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LeaderboardEntry } from '../leaderboard/entities/leaderboard-entry.entity';
import { Market } from '../markets/entities/market.entity';
import { Prediction } from '../predictions/entities/prediction.entity';
import { User } from '../users/entities/user.entity';
import { ActivityLog } from './entities/activity-log.entity';
import { DashboardKpisDto } from './dto/dashboard-kpis.dto';
import {
  MarketAnalyticsDto,
  OutcomeDistributionDto,
} from './dto/market-analytics.dto';

/** Tier thresholds: Bronze < 200, Silver < 500, Gold < 1000, Platinum ≥ 1000 */
export function predictorTierFromReputation(reputationScore: number): string {
  if (reputationScore < 200) return 'Bronze Predictor';
  if (reputationScore < 500) return 'Silver Predictor';
  if (reputationScore < 1000) return 'Gold Predictor';
  return 'Platinum Predictor';
}

export function accuracyRateFromUser(user: User): string {
  if (user.total_predictions <= 0) return '0.0';
  return ((user.correct_predictions / user.total_predictions) * 100).toFixed(1);
}

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(Prediction)
    private readonly predictionsRepository: Repository<Prediction>,
    @InjectRepository(LeaderboardEntry)
    private readonly leaderboardRepository: Repository<LeaderboardEntry>,
    @InjectRepository(Market)
    private readonly marketsRepository: Repository<Market>,
    @InjectRepository(ActivityLog)
    private readonly activityLogsRepository: Repository<ActivityLog>,
  ) {}

  async logActivity(
    userId: string,
    actionType: string,
    details?: Record<string, unknown> | null,
    ipAddress?: string,
  ) {
    const log = this.activityLogsRepository.create({
      userId,
      actionType,
      actionDetails: details,
      ipAddress,
    });
    return this.activityLogsRepository.save(log);
  }

  async getDashboard(user: User): Promise<DashboardKpisDto> {
    const fullUser = await this.usersRepository.findOne({
      where: { id: user.id },
    });
    if (!fullUser) {
      throw new NotFoundException('User not found');
    }

    const latestGlobalEntry = await this.leaderboardRepository
      .createQueryBuilder('entry')
      .where('entry.user_id = :userId', { userId: fullUser.id })
      .andWhere('entry.season_id IS NULL')
      .orderBy('entry.updated_at', 'DESC')
      .getOne();

    const active_predictions_count = await this.predictionsRepository
      .createQueryBuilder('prediction')
      .innerJoin('prediction.market', 'market')
      .where('prediction.userId = :userId', { userId: fullUser.id })
      .andWhere('market.is_resolved = false')
      .andWhere('market.is_cancelled = false')
      .getCount();

    const resolvedPredictions = await this.predictionsRepository
      .createQueryBuilder('prediction')
      .innerJoinAndSelect('prediction.market', 'market')
      .where('prediction.userId = :userId', { userId: fullUser.id })
      .andWhere('market.is_resolved = true')
      .andWhere('market.is_cancelled = false')
      .orderBy('market.resolution_time', 'DESC')
      .addOrderBy('prediction.submitted_at', 'DESC')
      .getMany();

    const current_streak =
      this.computeWinStreakFromResolved(resolvedPredictions);

    const reputation_score = fullUser.reputation_score;

    return {
      total_predictions: fullUser.total_predictions,
      accuracy_rate: accuracyRateFromUser(fullUser),
      current_rank: latestGlobalEntry?.rank ?? 0,
      total_rewards_earned_stroops: String(fullUser.total_winnings_stroops),
      active_predictions_count,
      current_streak,
      reputation_score,
      tier: predictorTierFromReputation(reputation_score),
    };
  }

  private computeWinStreakFromResolved(predictions: Prediction[]): number {
    let streak = 0;
    for (const p of predictions) {
      const m = p.market;
      if (!m?.resolved_outcome) break;
      if (p.chosen_outcome === m.resolved_outcome) streak += 1;
      else break;
    }
    return streak;
  }

  /**
   * Get market analytics: pool size, participant count, outcome distribution, and time remaining
   */
  async getMarketAnalytics(marketId: string): Promise<MarketAnalyticsDto> {
    const market = await this.marketsRepository.findOne({
      where: [{ id: marketId }, { on_chain_market_id: marketId }],
    });

    if (!market) {
      throw new NotFoundException(`Market "${marketId}" not found`);
    }

    const predictions = await this.predictionsRepository.find({
      where: { market: { id: market.id } },
    });

    const outcomeCounts = new Map<string, number>();

    market.outcome_options.forEach((outcome) => {
      outcomeCounts.set(outcome, 0);
    });

    predictions.forEach((prediction) => {
      const currentCount = outcomeCounts.get(prediction.chosen_outcome) || 0;
      outcomeCounts.set(prediction.chosen_outcome, currentCount + 1);
    });

    const total = predictions.length;
    const outcomeDistribution: OutcomeDistributionDto[] = Array.from(
      outcomeCounts.entries(),
    ).map(([outcome, count]) => {
      const percentage =
        total > 0 ? Math.round((count / total) * 100 * 100) / 100 : 0;
      return {
        outcome,
        count,
        percentage,
      };
    });

    const now = new Date().getTime();
    const endTime = new Date(market.end_time).getTime();
    const timeRemainingSeconds = Math.max(
      0,
      Math.floor((endTime - now) / 1000),
    );

    this.logger.log(
      `Market analytics retrieved for "${market.title}" (${market.id}) - ${predictions.length} predictions`,
    );

    return {
      market_id: market.id,
      total_pool_stroops: market.total_pool_stroops,
      participant_count: market.participant_count,
      outcome_distribution: outcomeDistribution,
      time_remaining_seconds: timeRemainingSeconds,
    };
  }
}
