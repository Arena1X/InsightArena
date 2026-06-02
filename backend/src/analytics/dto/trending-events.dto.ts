import { ApiProperty } from '@nestjs/swagger';

export class EventBasicInfoDto {
  @ApiProperty({ example: 'uuid-id' })
  id: string;

  @ApiProperty({ example: 123 })
  on_chain_event_id: number;

  @ApiProperty({ example: 'Sample Event' })
  title: string;

  @ApiProperty({ example: 'Event description' })
  description: string;

  @ApiProperty({ example: '2024-06-01T10:00:00Z' })
  on_chain_created_at: string;

  @ApiProperty({ example: 'creator_address_here' })
  creator_address: string;

  @ApiProperty({ example: true })
  is_active: boolean;

  @ApiProperty({ example: false })
  is_cancelled: boolean;

  @ApiProperty({ example: 50 })
  participant_count: number;

  @ApiProperty({ example: 10 })
  match_count: number;
}

export class TrendingEventDto {
  @ApiProperty({ type: EventBasicInfoDto })
  event: EventBasicInfoDto;

  @ApiProperty({
    example: 95.5,
    description: 'Trending score based on activity metrics',
  })
  trending_score: number;

  @ApiProperty({
    example: 12,
    description: 'Number of recent activity events',
  })
  recent_activity_count: number;

  @ApiProperty({
    example: 0.25,
    description: 'Growth rate as a decimal (e.g., 0.25 = 25%)',
  })
  participant_growth_rate: number;
}

export class TrendingEventsResponseDto {
  @ApiProperty({
    type: [TrendingEventDto],
    description: 'Array of trending events',
  })
  events: TrendingEventDto[];

  @ApiProperty({ example: 10 })
  limit: number;

  @ApiProperty({ example: '24h' })
  timeWindow: string;

  @ApiProperty({ example: '2024-06-02T10:00:00Z' })
  generated_at: string;
}
