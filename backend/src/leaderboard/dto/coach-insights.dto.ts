import { ApiProperty } from '@nestjs/swagger';

export class CoachCategoryStatDto {
  @ApiProperty({ example: 'Crypto' })
  category: string;

  @ApiProperty({ example: 8 })
  predictions: number;

  @ApiProperty({ example: 6 })
  correct: number;

  @ApiProperty({
    description: 'Accuracy percentage with one decimal, e.g. "75.0"',
    example: '75.0',
  })
  accuracy_rate: string;
}

export class CoachAccuracyTrendDto {
  @ApiProperty({
    enum: ['improving', 'declining', 'steady', 'not_enough_data'],
    example: 'improving',
  })
  direction: 'improving' | 'declining' | 'steady' | 'not_enough_data';

  @ApiProperty({
    description:
      'Accuracy (percentage points) over the more recent half of the analysed window',
    example: 80,
  })
  recent_accuracy: number;

  @ApiProperty({
    description:
      'Accuracy (percentage points) over the older half of the analysed window',
    example: 55,
  })
  prior_accuracy: number;
}

export class CoachInsightPayloadDto {
  @ApiProperty({ type: CoachAccuracyTrendDto })
  accuracy_trend: CoachAccuracyTrendDto;

  @ApiProperty({ type: CoachCategoryStatDto, nullable: true })
  best_category: CoachCategoryStatDto | null;

  @ApiProperty({ type: CoachCategoryStatDto, nullable: true })
  worst_category: CoachCategoryStatDto | null;

  @ApiProperty({
    description: 'Correct streak ending at the most recent resolved prediction',
  })
  current_streak: number;

  @ApiProperty({
    description: 'Longest correct streak within the analysed window',
  })
  longest_streak: number;

  @ApiProperty({ description: 'Number of resolved predictions analysed' })
  total_resolved: number;

  @ApiProperty()
  generated_at: string;
}

export class CoachInsightsResponse {
  @ApiProperty({
    description:
      'False when the user is below the minimum resolved-prediction threshold; insights are null and message explains how to unlock the coach.',
  })
  has_history: boolean;

  @ApiProperty({ nullable: true })
  message: string | null;

  @ApiProperty({ type: CoachInsightPayloadDto, nullable: true })
  insights: CoachInsightPayloadDto | null;
}
