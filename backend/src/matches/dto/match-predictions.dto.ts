import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class DistributionStatDto {
  @ApiProperty()
  outcome: string;

  @ApiProperty()
  count: number;

  @ApiProperty()
  percentage: string;
}

class UserPredictionDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  user_address: string;

  @ApiProperty()
  predicted_outcome: string;

  @ApiProperty()
  predicted_at: Date;

  @ApiPropertyOptional({ nullable: true })
  is_correct: boolean | null;
}

export class MatchPredictionsResponseDto {
  @ApiProperty({ type: [DistributionStatDto] })
  distribution: DistributionStatDto[];

  @ApiProperty()
  total_predictions: number;

  @ApiPropertyOptional({ type: [UserPredictionDto] })
  users?: UserPredictionDto[];

  @ApiPropertyOptional()
  meta?: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
