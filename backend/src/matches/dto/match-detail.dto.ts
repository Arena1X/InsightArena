import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class EventInfoDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  on_chain_event_id: number;

  @ApiProperty()
  title: string;

  @ApiProperty()
  creator_address: string;

  @ApiProperty({ required: false })
  is_active?: boolean;

  @ApiProperty({ required: false })
  is_cancelled?: boolean;
}

class PredictionDistributionDto {
  @ApiProperty()
  outcome: string;

  @ApiProperty()
  count: number;

  @ApiProperty()
  percentage: string;
}

export class MatchDetailDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  on_chain_match_id: number;

  @ApiProperty()
  team_a: string;

  @ApiProperty()
  team_b: string;

  @ApiProperty()
  match_time: Date;

  @ApiProperty()
  result_submitted: boolean;

  @ApiPropertyOptional({ nullable: true })
  winning_team: string | null;

  @ApiPropertyOptional({ nullable: true })
  home_score: number | null;

  @ApiPropertyOptional({ nullable: true })
  away_score: number | null;

  @ApiProperty()
  points_multiplier: number;

  @ApiProperty()
  total_predictions: number;

  @ApiProperty({ type: [PredictionDistributionDto] })
  prediction_distribution: PredictionDistributionDto[];

  @ApiProperty({ type: EventInfoDto })
  event_info: EventInfoDto;

  @ApiPropertyOptional({ nullable: true })
  submitted_by: string | null;

  @ApiPropertyOptional({ nullable: true })
  submitted_at: Date | null;

  @ApiProperty()
  created_at: Date;
}
