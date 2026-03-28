import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Market } from '../markets/entities/market.entity';
import { Prediction } from '../predictions/entities/prediction.entity';
import {
  MarketAnalyticsDto,
  OutcomeDistributionDto,
} from './dto/market-analytics.dto';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    @InjectRepository(Market)
    private readonly marketsRepository: Repository<Market>,
    @InjectRepository(Prediction)
    private readonly predictionsRepository: Repository<Prediction>,
  ) {}

  /**
   * Get market analytics: pool size, participant count, outcome distribution, and time remaining
   */
  async getMarketAnalytics(marketId: string): Promise<MarketAnalyticsDto> {
    // Fetch market by ID or on-chain ID
    const market = await this.marketsRepository.findOne({
      where: [{ id: marketId }, { on_chain_market_id: marketId }],
    });

    if (!market) {
      throw new NotFoundException(`Market "${marketId}" not found`);
    }

    // Get all predictions for this market grouped by outcome
    const predictions = await this.predictionsRepository.find({
      where: { market: { id: market.id } },
    });

    // Calculate outcome distribution
    const outcomeCounts = new Map<string, number>();

    // Initialize all outcomes with 0 count
    market.outcome_options.forEach((outcome) => {
      outcomeCounts.set(outcome, 0);
    });

    // Count predictions by outcome
    predictions.forEach((prediction) => {
      const currentCount = outcomeCounts.get(prediction.chosen_outcome) || 0;
      outcomeCounts.set(prediction.chosen_outcome, currentCount + 1);
    });

    // Calculate percentages
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

    // Calculate time remaining in seconds
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
