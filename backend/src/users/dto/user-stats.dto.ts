import { ApiProperty } from '@nestjs/swagger';

export class PredictionHistoryDayDto {
  @ApiProperty({ example: '2025-03-15' })
  date: string;

  @ApiProperty({ example: 3 })
  count: number;
}

export class UserStatsDto {
  @ApiProperty()
  total_predictions: number;

  @ApiProperty()
  correct_predictions: number;

  @ApiProperty({ description: 'Percentage, 0–100' })
  accuracy_rate: number;

  @ApiProperty({ description: 'Stroops as string (bigint)' })
  total_staked_stroops: string;

  @ApiProperty()
  total_winnings_stroops: string;

  @ApiProperty({ description: 'winnings minus staked (stroops)' })
  net_profit_stroops: string;

  @ApiProperty()
  reputation_score: number;

  @ApiProperty()
  season_points: number;

  @ApiProperty({ description: 'Global leaderboard rank (0 if unranked)' })
  rank: number;

  @ApiProperty()
  markets_created: number;

  @ApiProperty()
  competitions_joined: number;

  @ApiProperty()
  competitions_won: number;

  @ApiProperty({ type: [String] })
  favorite_categories: string[];

  @ApiProperty({ type: [PredictionHistoryDayDto] })
  prediction_history: PredictionHistoryDayDto[];
}
