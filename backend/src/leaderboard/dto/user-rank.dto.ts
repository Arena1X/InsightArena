import { ApiProperty } from '@nestjs/swagger';

export class UserRankDto {
  @ApiProperty()
  rank: number;

  @ApiProperty()
  reputation_score: number;

  @ApiProperty()
  season_points: number;

  @ApiProperty()
  total_predictions: number;

  @ApiProperty()
  correct_predictions: number;

  @ApiProperty()
  accuracy_rate: string;

  @ApiProperty()
  total_winnings_stroops: string;
}
