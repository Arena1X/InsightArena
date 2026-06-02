import { ApiProperty } from '@nestjs/swagger';

export class CreatorStatsDto {
  @ApiProperty({ example: 'creator_address_here' })
  creator_address: string;

  @ApiProperty({ example: 15 })
  event_count: number;
}

export class EventStatsDto {
  @ApiProperty({ example: 'Event Title' })
  title: string;

  @ApiProperty({ example: 150 })
  participant_count: number;

  @ApiProperty({ example: 'creator_address_here' })
  creator_address: string;
}

export class PlatformStatsDto {
  @ApiProperty({ example: 250 })
  total_events_created: number;

  @ApiProperty({ example: 45 })
  active_events_count: number;

  @ApiProperty({ example: 150 })
  completed_events_count: number;

  @ApiProperty({ example: 55 })
  cancelled_events_count: number;

  @ApiProperty({ example: 3500 })
  total_unique_participants: number;

  @ApiProperty({ example: 12000 })
  total_matches_created: number;

  @ApiProperty({ example: 95000 })
  total_predictions_submitted: number;

  @ApiProperty({
    example: '125000000000',
    description: 'Total fees collected in stroops (string bigint)',
  })
  total_fees_collected_stroops: string;

  @ApiProperty({ example: 14 })
  avg_participants_per_event: number;

  @ApiProperty({ example: 48 })
  avg_matches_per_event: number;

  @ApiProperty({ example: 12.5 })
  avg_predictions_per_user: number;

  @ApiProperty({ type: CreatorStatsDto })
  most_active_creator: CreatorStatsDto | null;

  @ApiProperty({ type: EventStatsDto })
  most_popular_event: EventStatsDto | null;

  @ApiProperty({ example: '2024-06-02T10:00:00Z' })
  generated_at: string;
}
