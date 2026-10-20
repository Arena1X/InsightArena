import { ApiProperty } from '@nestjs/swagger';

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

  @ApiProperty({
    description:
      'Total prize pool in stroops, including entry fees collected from participants',
  })
  prizePool: string;

  @ApiProperty({
    description:
      'Running total of entry fees collected from participants in stroops',
  })
  totalEntryFeesCollected: string;
}
