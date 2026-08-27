import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';

export enum SeedingMetric {
  Score = 'score',
  Rank = 'rank',
  JoinedAt = 'joined_at',
}

export class GenerateBracketDto {
  @ApiProperty({
    enum: SeedingMetric,
    description: 'Metric used to seed participants (higher = better seed)',
    default: SeedingMetric.Score,
  })
  @IsEnum(SeedingMetric)
  metric: SeedingMetric = SeedingMetric.Score;
}
