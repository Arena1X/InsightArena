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
}
