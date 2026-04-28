import { ApiProperty } from '@nestjs/swagger';

export class PredictionOutcomeDto {
  @ApiProperty()
  outcome: string;

  @ApiProperty()
  count: number;

  @ApiProperty()
  percentage: number;

  @ApiProperty()
  total_staked_stroops: string;
}

export class MarketEventDto {
  @ApiProperty()
  timestamp: Date;

  @ApiProperty()
  event_type: string;

  @ApiProperty()
  description: string;
}

export class MarketReportDto {
  @ApiProperty()
  market_id: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  description: string;

  @ApiProperty()
  category: string;

  @ApiProperty()
  created_at: Date;

  @ApiProperty()
  end_time: Date;

  @ApiProperty()
  resolution_time: Date;

  @ApiProperty()
  is_resolved: boolean;

  @ApiProperty({ nullable: true })
  resolved_outcome: string | null;

  @ApiProperty()
  total_participants: number;

  @ApiProperty()
  total_pool_stroops: string;

  @ApiProperty({ type: [PredictionOutcomeDto] })
  outcome_distribution: PredictionOutcomeDto[];

  @ApiProperty({ type: [MarketEventDto] })
  timeline: MarketEventDto[];

  @ApiProperty()
  generated_at: Date;
}
