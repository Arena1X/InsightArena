import { ApiProperty } from '@nestjs/swagger';

export class CohortDataDto {
  @ApiProperty({ description: 'Cohort period label (e.g. "2024-01")' })
  cohort: string;

  @ApiProperty({ description: 'Number of users who signed up in this cohort' })
  total_users: number;

  @ApiProperty({
    description: 'Retention rates for each subsequent period',
    type: 'object',
    additionalProperties: { type: 'number' },
    example: { '0': 100, '1': 60, '2': 45, '3': 30 },
  })
  retention_rates: Record<string, number>;

  @ApiProperty({
    description: 'User counts for each subsequent period',
    type: 'object',
    additionalProperties: { type: 'number' },
    example: { '0': 100, '1': 60 },
  })
  user_counts: Record<string, number>;
}

export class RetentionResponseDto {
  @ApiProperty({ description: 'Period granularity used' })
  period: string;

  @ApiProperty({ description: 'Total unique users in analysis' })
  total_users: number;

  @ApiProperty({
    description: 'Retention matrix by cohort',
    type: [CohortDataDto],
  })
  cohorts: CohortDataDto[];

  @ApiProperty()
  generated_at: Date;
}

export class RetentionQueryDto {
  @ApiProperty({
    required: false,
    enum: ['day', 'week', 'month'],
    default: 'week',
  })
  period?: 'day' | 'week' | 'month';

  @ApiProperty({
    required: false,
    description: 'Number of periods to analyze (default: 8)',
  })
  periods?: number;
}
