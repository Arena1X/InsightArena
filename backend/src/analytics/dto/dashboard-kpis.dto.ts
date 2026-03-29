import { ApiProperty } from '@nestjs/swagger';

export class DashboardKpisDto {
  @ApiProperty({ example: 128 })
  total_predictions: number;

  @ApiProperty({
    example: '68.4',
    description: 'Percentage, one decimal place',
  })
  accuracy_rate: string;

  @ApiProperty({ example: 24 })
  current_rank: number;

  @ApiProperty({
    example: '1240000000',
    description: 'Total winnings in stroops (string bigint)',
  })
  total_rewards_earned_stroops: string;

  @ApiProperty({ example: 5 })
  active_predictions_count: number;

  @ApiProperty({
    example: 4,
    description: 'Consecutive wins from the most recent resolved markets',
  })
  current_streak: number;

  @ApiProperty({ example: 840 })
  reputation_score: number;

  @ApiProperty({ example: 'Gold Predictor' })
  tier: string;
}
