import { ApiProperty } from '@nestjs/swagger';

export class MarketHistoryPointDto {
  @ApiProperty()
  timestamp: Date;

  @ApiProperty()
  prediction_volume: number;

  @ApiProperty()
  pool_size_stroops: string;

  @ApiProperty()
  participant_count: number;

  @ApiProperty({ type: [Number], nullable: true })
  outcome_probabilities: number[] | null;
}

export class MarketHistoryResponseDto {
  @ApiProperty()
  market_id: string;

  @ApiProperty()
  title: string;

  @ApiProperty({ type: [MarketHistoryPointDto] })
  history: MarketHistoryPointDto[];

  @ApiProperty()
  generated_at: Date;
}
