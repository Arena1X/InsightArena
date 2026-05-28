import { ApiProperty } from '@nestjs/swagger';

export class UserAnalyticsDto {
  @ApiProperty({ example: 'GAXYZ...' })
  address: string;

  @ApiProperty({ example: 45 })
  total_events_joined: number;

  @ApiProperty({ example: 8 })
  total_events_created: number;

  @ApiProperty({ example: 156 })
  total_predictions_made: number;

  @ApiProperty({ example: 107 })
  total_correct_predictions: number;

  @ApiProperty({ example: '68.6', description: 'Percentage with one decimal' })
  overall_accuracy_percentage: string;

  @ApiProperty({ example: 12 })
  total_wins: number;

  @ApiProperty({ example: '7.7', description: 'Perfect score events percentage' })
  win_rate: string;

  @ApiProperty({ example: 'Team A', description: 'Most predicted outcome' })
  most_predicted_outcome: string;

  @ApiProperty({ example: 2.1, description: 'Average predictions per event' })
  average_predictions_per_event: number;

  @ApiProperty({
    example: ['Sports', 'Politics'],
    description: 'Top favorite categories',
  })
  favorite_event_categories: string[];

  @ApiProperty({
    example: [
      { date: '2026-05-28', prediction_count: 5 },
      { date: '2026-05-27', prediction_count: 3 },
    ],
    description: 'Activity timeline',
  })
  activity_timeline: Array<{ date: string; prediction_count: number }>;
}

export class UserAnalyticsQueryDto {
  from?: string;
  to?: string;
}
