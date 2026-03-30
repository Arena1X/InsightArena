import { ApiProperty } from '@nestjs/swagger';

export class UserRankResponseDto {
  @ApiProperty({ example: 42 })
  rank: number;

  @ApiProperty({ example: 850 })
  score: number;

  @ApiProperty({ example: 1200 })
  total_participants: number;

  @ApiProperty({ example: 96.5, description: 'User percentile (0-100)' })
  percentile: number;
}
