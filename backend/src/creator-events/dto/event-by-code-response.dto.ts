import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class MatchPreviewDto {
  @ApiProperty({ description: 'Match ID' })
  matchId: string;

  @ApiProperty({ description: 'Home team name' })
  homeTeam: string;

  @ApiProperty({ description: 'Away team name' })
  awayTeam: string;

  @ApiProperty({ description: 'Match start time (Unix timestamp)' })
  startTime: number;
}

export class EventByCodeResponseDto {
  @ApiProperty({ description: 'Event ID' })
  eventId: string;

  @ApiProperty({ description: 'Event title' })
  title: string;

  @ApiProperty({ description: 'Event description' })
  description: string;

  @ApiProperty({ description: 'Creator address' })
  creator: string;

  @ApiProperty({ description: 'Current participant count' })
  participantCount: number;

  @ApiProperty({ description: 'Maximum participants allowed' })
  maxParticipants: number;

  @ApiProperty({ description: 'Total number of matches' })
  matchCount: number;

  @ApiProperty({
    enum: ['active', 'full', 'cancelled'],
    description: 'Event status',
  })
  status: 'active' | 'full' | 'cancelled';

  @ApiProperty({
    type: [MatchPreviewDto],
    description: 'First 5 matches preview',
  })
  matchPreview: MatchPreviewDto[];

  @ApiProperty({ description: 'Event start time (Unix timestamp)' })
  startTime: number;

  @ApiProperty({ description: 'Event end time (Unix timestamp)' })
  endTime: number;

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
}
