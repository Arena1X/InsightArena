import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UserPredictionMatchDto {
  @ApiProperty({ description: 'Match identifier' })
  matchId: string;

  @ApiProperty({ description: 'Home team name' })
  homeTeam: string;

  @ApiProperty({ description: 'Away team name' })
  awayTeam: string;

  @ApiProperty({ description: 'Match start time (Unix timestamp)' })
  matchTime: number;
}

export class UserPredictionItemDto {
  @ApiProperty({ description: 'Prediction identifier' })
  predictionId: string;

  @ApiProperty({ description: 'Match identifier' })
  matchId: string;

  @ApiProperty({ type: UserPredictionMatchDto })
  match: UserPredictionMatchDto;

  @ApiProperty({
    description: 'Predicted outcome (TEAM_A, TEAM_B, or DRAW)',
  })
  predictedOutcome: string;

  @ApiPropertyOptional({
    description: 'Actual match result if resolved',
    nullable: true,
  })
  actualResult: string | null;

  @ApiPropertyOptional({
    description: 'Whether prediction was correct (null if unresolved)',
    nullable: true,
  })
  isCorrect: boolean | null;

  @ApiProperty({ description: 'Prediction submission timestamp (Unix)' })
  predictedAt: number;
}

export class UserPredictionsScoreDto {
  @ApiProperty({ description: 'Total predictions made by user' })
  totalPredictions: number;

  @ApiProperty({
    description: 'Correct predictions (resolved matches only)',
  })
  correctPredictions: number;

  @ApiProperty({ description: 'Accuracy percentage (0-100)' })
  accuracyPercentage: number;

  @ApiProperty({
    description: 'Matches remaining without a user prediction',
  })
  matchesRemaining: number;
}

export class UserPredictionsResponseDto {
  @ApiProperty({ description: 'User wallet address' })
  address: string;

  @ApiProperty({ description: 'Event identifier' })
  eventId: string;

  @ApiProperty({ type: UserPredictionsScoreDto })
  score: UserPredictionsScoreDto;

  @ApiProperty({ type: [UserPredictionItemDto] })
  predictions: UserPredictionItemDto[];
}
