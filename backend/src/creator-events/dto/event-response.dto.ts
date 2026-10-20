import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class EventResponseDto {
  @ApiProperty({ description: 'Event ID' })
  eventId: string;

  @ApiProperty({ description: 'Invite code' })
  inviteCode: string;

  @ApiProperty({ description: 'Creator address' })
  creator: string;

  @ApiProperty({ description: 'Event title' })
  title: string;

  @ApiProperty({ description: 'Event description' })
  description: string;

  @ApiProperty({ description: 'Start time (Unix timestamp)' })
  startTime: number;

  @ApiProperty({ description: 'End time (Unix timestamp)' })
  endTime: number;

  @ApiProperty({ description: 'Maximum participants' })
  maxParticipants: number;

  @ApiProperty({ description: 'Current participant count' })
  participantCount: number;

  @ApiProperty({ description: 'Total matches in event' })
  matchCount: number;

  @ApiProperty({ description: 'Is event active' })
  isActive: boolean;

  @ApiPropertyOptional({ description: 'Total prize pool in stroops' })
  prizePool?: string;

  @ApiPropertyOptional({ description: 'Entry fee in stroops' })
  entryFee?: string;

  @ApiPropertyOptional({ description: 'Campaign category slug' })
  category?: string;

  @ApiPropertyOptional({ description: 'Campaign banner URL' })
  bannerUrl?: string | null;

  @ApiPropertyOptional({
    description: 'Whether the campaign has been finalized',
  })
  isFinalized?: boolean;

  @ApiPropertyOptional({
    type: [Number],
    description: 'Reward split percentages',
  })
  rewardDistribution?: number[];

  @ApiPropertyOptional({ description: 'Number of winners' })
  winnerCount?: number;

  @ApiPropertyOptional({ description: 'Is creator verified' })
  creatorVerified?: boolean;

  @ApiPropertyOptional({
    description: 'Match preview (first 5 matches)',
    type: 'array',
    items: {
      type: 'object',
      properties: {
        matchId: { type: 'string' },
        homeTeam: { type: 'string' },
        awayTeam: { type: 'string' },
      },
    },
  })
  matchPreview?: Array<{ matchId: string; homeTeam: string; awayTeam: string }>;
}

export class PaginatedEventsResponseDto {
  @ApiProperty({
    description: 'Array of events',
    type: [EventResponseDto],
  })
  data: EventResponseDto[];

  @ApiProperty({ description: 'Total count of events' })
  total: number;

  @ApiProperty({ description: 'Current page' })
  page: number;

  @ApiProperty({ description: 'Items per page' })
  limit: number;

  @ApiProperty({ description: 'Total pages' })
  totalPages: number;
}
