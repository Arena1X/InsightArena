import { Expose, Type } from 'class-transformer';

export class OutcomeDistributionDto {
  @Expose()
  outcome: string;

  @Expose()
  count: number;

  @Expose()
  percentage: number;
}

export class MarketAnalyticsDto {
  @Expose()
  market_id: string;

  @Expose()
  total_pool_stroops: string;

  @Expose()
  participant_count: number;

  @Expose()
  @Type(() => OutcomeDistributionDto)
  outcome_distribution: OutcomeDistributionDto[];

  @Expose()
  time_remaining_seconds: number;
}
