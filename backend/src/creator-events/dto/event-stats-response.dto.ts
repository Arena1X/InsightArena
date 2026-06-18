import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class MatchPredictionDistributionDto {
  @ApiProperty({ description: 'Match identifier' })
  matchId: string;

  @ApiProperty({ description: 'Home team name' })
  homeTeam: string;

  @ApiProperty({ description: 'Away team name' })
  awayTeam: string;

  @ApiProperty({ description: 'Predictions for TEAM_A' })
  teamA: number;

  @ApiProperty({ description: 'Predictions for TEAM_B' })
  teamB: number;

  @ApiProperty({ description: 'Predictions for DRAW' })
  draw: number;

  @ApiProperty({ description: 'Total predictions for this match' })
  total: number;
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

export class EventStatsResponseDto {
  @ApiProperty({ description: 'Event identifier' })
  eventId: string;

  @ApiProperty({ description: 'Total participants' })
  totalParticipants: number;

  @ApiProperty({ description: 'Total matches in the event' })
  totalMatches: number;

  @ApiProperty({ description: 'Number of resolved matches' })
  matchesResolved: number;

  @ApiProperty({ description: 'Number of pending (unresolved) matches' })
  matchesPending: number;

  @ApiProperty({
    description: 'Total predictions submitted across all matches',
  })
  totalPredictions: number;

  @ApiProperty({
    type: [MatchPredictionDistributionDto],
    description: 'Prediction distribution per match',
  })
  predictionDistribution: MatchPredictionDistributionDto[];

  @ApiProperty({ description: 'Whether event winners have been verified' })
  winnersVerified: boolean;

  @ApiProperty({ description: 'Number of verified winners' })
  winnerCount: number;

  @ApiProperty({
    description: 'Average predictions per participant',
  })
  averagePredictionsPerUser: number;

  @ApiProperty({
    description: 'Percentage of participants who predicted all matches (0-100)',
  })
  completionRate: number;

  @ApiPropertyOptional({
    description: 'Prize pool amount in stroops (smallest unit)',
  })
  prizePool?: string;

  @ApiPropertyOptional({
    description: 'Reward distribution percentages by rank',
    type: RewardDistributionDto,
  })
  rewardDistribution?: RewardDistributionDto;
}
