import { IsOptional, IsNumber, Min, Max, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class DiscoverEventsQueryDto {
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  @ApiProperty({ example: 20, description: 'Number of events to return' })
  limit?: number = 20;

  @IsOptional()
  @IsBoolean()
  @ApiProperty({
    example: false,
    description: 'Exclude events user has already joined',
  })
  excludeJoined?: boolean = false;
}

export class DiscoveredEventDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  on_chain_event_id: number;

  @ApiProperty()
  title: string;

  @ApiProperty()
  description: string;

  @ApiProperty()
  creator_address: string;

  @ApiProperty()
  participant_count: number;

  @ApiProperty()
  match_count: number;

  @ApiProperty()
  is_active: boolean;

  @ApiProperty({
    example: 'trending',
    enum: ['similar', 'trending', 'new', 'popular'],
  })
  discovery_reason: string;

  @ApiProperty()
  created_at: Date;
}

export class DiscoverEventsResponseDto {
  @ApiProperty({ type: [DiscoveredEventDto] })
  data: DiscoveredEventDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  limit: number;
}
