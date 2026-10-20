import { ApiProperty } from '@nestjs/swagger';

export class UserStatsResponseDto {
  @ApiProperty()
  total_predictions: number;

  @ApiProperty()
  correct_predictions: number;

  @ApiProperty()
  incorrect_predictions: number;

  @ApiProperty({ example: '70.0' })
  accuracy_rate: string;

  @ApiProperty({ example: 'Bronze Predictor' })
  tier: string;

  @ApiProperty()
  reputation_score: number;

  @ApiProperty()
  season_points: number;

  @ApiProperty()
  total_staked_stroops: string;

  @ApiProperty()
  total_winnings_stroops: string;
}
