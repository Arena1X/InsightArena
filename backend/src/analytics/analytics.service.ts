import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LeaderboardEntry } from '../leaderboard/entities/leaderboard-entry.entity';
import { Market } from '../markets/entities/market.entity';
import { Prediction } from '../predictions/entities/prediction.entity';
import { User } from '../users/entities/user.entity';
import { ActivityLog } from './entities/activity-log.entity';
import { MarketHistory } from './entities/market-history.entity';
import { DashboardKpisDto } from './dto/dashboard-kpis.dto';
import {
  MarketAnalyticsDto,
  OutcomeDistributionDto,
} from './dto/market-analytics.dto';
import { MarketHistoryResponseDto } from './dto/market-history.dto';
import {
  UserTrendsDto,
  TrendDataPointDto,
  CategoryPerformanceDto,
} from './dto/user-trends.dto';
import {
  CategoryStatsDto,
  CategoryAnalyticsResponseDto,
} from './dto/category-analytics.dto';

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
    @InjectRepository(MarketHistory)
    private readonly marketHistoryRepository: Repository<MarketHistory>,
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

  async getDashboardKPIs(user: User): Promise<DashboardKpisDto> {
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

  /**
   * Get historical data for a market: prediction volume, pool size, participant growth over time
   */
  async getMarketHistory(
    marketId: string,
    from?: string,
    to?: string,
    interval?: string, // TODO: Implement interval-based aggregation
  ): Promise<MarketHistoryResponseDto> {
    if (interval) {
      this.logger.debug(
        `Interval aggregation (${interval}) requested but not yet implemented`,
      );
    }

    const market = await this.marketsRepository.findOne({
      where: [{ id: marketId }, { on_chain_market_id: marketId }],
    });

    if (!market) {
      throw new NotFoundException(`Market "${marketId}" not found`);
    }

    const qb = this.marketHistoryRepository
      .createQueryBuilder('history')
      .where('history.marketId = :marketId', { marketId: market.id });

    if (from) {
      qb.andWhere('history.recorded_at >= :from', { from });
    } else {
      const lastWeek = new Date();
      lastWeek.setDate(lastWeek.getDate() - 7);
      qb.andWhere('history.recorded_at >= :from', { from: lastWeek });
    }

    if (to) {
      qb.andWhere('history.recorded_at <= :to', { to });
    }

    qb.orderBy('history.recorded_at', 'ASC');

    const history = await qb.getMany();

    return {
      market_id: market.id,
      title: market.title,
      history: history.map((h) => ({
        timestamp: h.recorded_at,
        prediction_volume: h.prediction_volume,
        pool_size_stroops: h.pool_size_stroops,
        participant_count: h.participant_count,
        outcome_probabilities: h.outcome_probabilities
          ? h.outcome_probabilities.map((p) => parseFloat(p))
          : null,
      })),
      generated_at: new Date(),
    };
  }

  /**
   * Record market snapshot for historical tracking
   */
  async recordMarketSnapshot(market: Market): Promise<void> {
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
    const probabilities = Array.from(outcomeCounts.values()).map((count) =>
      total > 0 ? ((count / total) * 100).toFixed(2) : '0.00',
    );

    const snapshot = this.marketHistoryRepository.create({
      market,
      recorded_at: new Date(),
      prediction_volume: total,
      pool_size_stroops: market.total_pool_stroops,
      participant_count: market.participant_count,
      outcome_probabilities: probabilities,
    });

    await this.marketHistoryRepository.save(snapshot);
  }

  /**
   * Get user performance trends over time
   */
  async getUserTrends(
    address: string,
    days: number = 30,
  ): Promise<UserTrendsDto> {
    // Validate days parameter (default 30, max 90)
    const validDays = Math.min(Math.max(days || 30, 1), 90);

    const user = await this.usersRepository.findOne({
      where: { stellar_address: address },
    });

    if (!user) {
      throw new NotFoundException(`User with address ${address} not found`);
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - validDays);

    const predictions = await this.predictionsRepository.find({
      where: {
        user: { id: user.id },
        submitted_at: validDays < 90 ? undefined : undefined,
      },
      relations: ['market'],
      order: { submitted_at: 'ASC' },
    });

    // Filter predictions by date range
    const filteredPredictions = predictions.filter(
      (p) => p.submitted_at >= cutoffDate,
    );

    const accuracyTrend = this.computeAccuracyTrend(filteredPredictions);
    const volumeTrend = this.computeVolumeTrend(filteredPredictions);
    const profitLossTrend = this.computeProfitLossTrend(filteredPredictions);
    const categoryPerformance =
      this.computeCategoryPerformance(filteredPredictions);

    const bestCategory = categoryPerformance.reduce((best, current) =>
      current.accuracy_rate > (best?.accuracy_rate ?? 0) ? current : best,
    );

    const worstCategory = categoryPerformance.reduce((worst, current) =>
      current.accuracy_rate < (worst?.accuracy_rate ?? 100) ? current : worst,
    );

    return {
      address,
      accuracy_trend: accuracyTrend,
      prediction_volume_trend: volumeTrend,
      profit_loss_trend: profitLossTrend,
      category_performance: categoryPerformance,
      best_category: bestCategory || null,
      worst_category: worstCategory || null,
    };
  }

  private computeAccuracyTrend(predictions: Prediction[]): TrendDataPointDto[] {
    const trend: TrendDataPointDto[] = [];
    let correct = 0;
    let total = 0;

    predictions.forEach((p) => {
      if (p.market?.is_resolved) {
        total++;
        if (p.market.resolved_outcome === p.chosen_outcome) {
          correct++;
        }
        trend.push({
          timestamp: p.submitted_at,
          value: total > 0 ? Math.round((correct / total) * 10000) / 100 : 0,
        });
      }
    });

    return trend;
  }

  private computeVolumeTrend(predictions: Prediction[]): TrendDataPointDto[] {
    const trend: TrendDataPointDto[] = [];
    let count = 0;

    predictions.forEach((p) => {
      count++;
      trend.push({
        timestamp: p.submitted_at,
        value: count,
      });
    });

    return trend;
  }

  private computeProfitLossTrend(
    predictions: Prediction[],
  ): TrendDataPointDto[] {
    const trend: TrendDataPointDto[] = [];
    let cumulativePnL = 0n;

    predictions.forEach((p) => {
      if (p.market?.is_resolved) {
        const stake = BigInt(p.stake_amount_stroops || 0);
        const payout = BigInt(p.payout_amount_stroops || 0);
        cumulativePnL += payout - stake;

        trend.push({
          timestamp: p.submitted_at,
          value: Number(cumulativePnL),
        });
      }
    });

    return trend;
  }

  private computeCategoryPerformance(
    predictions: Prediction[],
  ): CategoryPerformanceDto[] {
    const categoryMap = new Map<
      string,
      { correct: number; total: number; pnl: bigint }
    >();

    predictions.forEach((p) => {
      const category = p.market?.category || 'Unknown';
      const current = categoryMap.get(category) || {
        correct: 0,
        total: 0,
        pnl: 0n,
      };

      if (p.market?.is_resolved) {
        current.total++;
        if (p.market.resolved_outcome === p.chosen_outcome) {
          current.correct++;
        }
        const stake = BigInt(p.stake_amount_stroops || 0);
        const payout = BigInt(p.payout_amount_stroops || 0);
        current.pnl += payout - stake;
      }

      categoryMap.set(category, current);
    });

    return Array.from(categoryMap.entries()).map(([category, stats]) => ({
      category,
      accuracy_rate:
        stats.total > 0
          ? Math.round((stats.correct / stats.total) * 10000) / 100
          : 0,
      prediction_count: stats.total,
      profit_loss_stroops: stats.pnl.toString(),
    }));
  }

  /**
   * Get category analytics with trending calculation
   */
  async getCategoryAnalytics(): Promise<CategoryAnalyticsResponseDto> {
    const markets = await this.marketsRepository.find();

    const categoryMap = new Map<
      string,
      {
        total: number;
        active: number;
        volume: bigint;
        participants: number[];
      }
    >();

    markets.forEach((market) => {
      const category = market.category || 'Unknown';
      const current = categoryMap.get(category) || {
        total: 0,
        active: 0,
        volume: 0n,
        participants: [],
      };

      current.total++;
      if (!market.is_resolved && !market.is_cancelled) {
        current.active++;
      }
      current.volume += BigInt(market.total_pool_stroops || 0);
      current.participants.push(market.participant_count);

      categoryMap.set(category, current);
    });

    const categories: CategoryStatsDto[] = Array.from(
      categoryMap.entries(),
    ).map(([name, stats]) => {
      const avgParticipants =
        stats.participants.length > 0
          ? Math.round(
              stats.participants.reduce((a, b) => a + b, 0) /
                stats.participants.length,
            )
          : 0;

      const trending = this.isCategoryTrending(stats.active, stats.total);

      return {
        name,
        total_markets: stats.total,
        active_markets: stats.active,
        total_volume_stroops: stats.volume.toString(),
        avg_participants: avgParticipants,
        trending,
      };
    });

    return {
      categories: categories.sort((a, b) => {
        const volA = BigInt(a.total_volume_stroops);
        const volB = BigInt(b.total_volume_stroops);
        if (volA > volB) return -1;
        if (volA < volB) return 1;
        return 0;
      }),
      generated_at: new Date(),
    };
  }

  private isCategoryTrending(active: number, total: number): boolean {
    if (total === 0) return false;
    const activeRatio = active / total;
    return activeRatio > 0.5;
  }

  async getUserAnalytics(
    address: string,
    from?: string,
    to?: string,
  ): Promise<{
    address: string;
    total_events_joined: number;
    total_events_created: number;
    total_predictions_made: number;
    total_correct_predictions: number;
    overall_accuracy_percentage: string;
    total_wins: number;
    win_rate: string;
    most_predicted_outcome: string;
    average_predictions_per_event: number;
    favorite_event_categories: string[];
    activity_timeline: Array<{ date: string; prediction_count: number }>;
  }> {
    const user = await this.usersRepository.findOne({
      where: { address: address.toLowerCase() },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const fromDate = from ? new Date(from) : new Date(0);
    const toDate = to ? new Date(to) : new Date();

    const predictionsQuery = this.predictionsRepository
      .createQueryBuilder('prediction')
      .innerJoinAndSelect('prediction.market', 'market')
      .where('prediction.userId = :userId', { userId: user.id })
      .andWhere('prediction.submitted_at >= :fromDate', { fromDate })
      .andWhere('prediction.submitted_at <= :toDate', { toDate });

    const predictions = await predictionsQuery.getMany();

    const totalCorrect = predictions.filter(
      (p) => p.market?.resolved_outcome === p.chosen_outcome,
    ).length;

    const marketCategoryMap = new Map<string, number>();
    const eventMap = new Map<string, boolean>();
    const outcomeCount = new Map<string, number>();
    const eventCategoryMap = new Map<string, string>();

    predictions.forEach((p) => {
      const category = p.market?.category || 'Unknown';
      const eventId = p.market?.id || '';

      eventMap.set(eventId, true);
      outcomeCount.set(p.chosen_outcome, (outcomeCount.get(p.chosen_outcome) || 0) + 1);

      if (!eventCategoryMap.has(eventId)) {
        eventCategoryMap.set(eventId, category);
      }
      if (!marketCategoryMap.has(category)) {
        marketCategoryMap.set(category, 0);
      }
      marketCategoryMap.set(category, marketCategoryMap.get(category)! + 1);
    });

    const categories = Array.from(marketCategoryMap.entries())
      .map(([cat, count]) => ({ category: cat, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map((c) => c.category);

    const mostPredicted = Array.from(outcomeCount.entries()).sort(
      (a, b) => b[1] - a[1],
    )[0];

    const activityMap = new Map<string, number>();
    predictions.forEach((p) => {
      const dateStr = new Date(p.submitted_at).toISOString().split('T')[0];
      activityMap.set(dateStr, (activityMap.get(dateStr) || 0) + 1);
    });

    const activityTimeline = Array.from(activityMap.entries())
      .map(([date, count]) => ({ date, prediction_count: count }))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 30);

    const accuracy =
      predictions.length > 0
        ? (totalCorrect / predictions.length * 100).toFixed(1)
        : '0.0';

    const totalEvents = eventMap.size;
    const avgPredictionsPerEvent =
      totalEvents > 0 ? predictions.length / totalEvents : 0;

    const perfectScoreEvents = await this.predictionsRepository
      .createQueryBuilder('prediction')
      .innerJoinAndSelect('prediction.market', 'market')
      .where('prediction.userId = :userId', { userId: user.id })
      .andWhere('market.resolved_outcome = prediction.chosen_outcome')
      .andWhere('market.is_resolved = true')
      .getCount();

    const winRate =
      totalEvents > 0 ? ((perfectScoreEvents / totalEvents) * 100).toFixed(1) : '0.0';

    return {
      address: user.address,
      total_events_joined: totalEvents,
      total_events_created: user.events_created || 0,
      total_predictions_made: predictions.length,
      total_correct_predictions: totalCorrect,
      overall_accuracy_percentage: accuracy,
      total_wins: perfectScoreEvents,
      win_rate: winRate,
      most_predicted_outcome: mostPredicted?.[0] || 'N/A',
      average_predictions_per_event: Math.round(avgPredictionsPerEvent * 10) / 10,
      favorite_event_categories: categories,
      activity_timeline: activityTimeline,
    };
  }
}
