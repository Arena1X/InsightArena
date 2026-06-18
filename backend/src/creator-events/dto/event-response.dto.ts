import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RewardDistributionDto {
  @ApiProperty({ description: 'Rank 1 percentage' })
  rank1: number;

  @ApiProperty({ description: 'Rank 2 percentage' })
  rank2: number;

  @ApiProperty({ description: 'Rank 3 percentage' })
  rank3: number;

  @ApiPropertyOptional({ description: 'Rank 4 percentage' })
  rank4?: number;

  @ApiPropertyOptional({ description: 'Rank 5 percentage' })
  rank5?: number;
}

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

  @ApiPropertyOptional({
    description: 'Prize pool amount in stroops (smallest unit)',
  })
  prizePool?: string;

  @ApiPropertyOptional({
    description: 'Entry fee amount in stroops (smallest unit)',
  })
  entryFee?: string;

  @ApiPropertyOptional({ description: 'Event category' })
  category?: string;

  @ApiPropertyOptional({ description: 'Banner image URL' })
  bannerUrl?: string;

  @ApiPropertyOptional({
    description: 'Reward distribution percentages by rank',
    type: RewardDistributionDto,
  })
  rewardDistribution?: RewardDistributionDto;

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
