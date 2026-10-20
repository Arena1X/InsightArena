import { ApiProperty } from '@nestjs/swagger';

export class UserScoreResponseDto {
  @ApiProperty({ description: 'User wallet address' })
  address: string;

  @ApiProperty({ description: 'Total matches in the event' })
  totalMatches: number;

  @ApiProperty({ description: 'Total predictions made by user' })
  totalPredictions: number;

  @ApiProperty({
    description: 'Number of correct predictions (resolved matches only)',
  })
  correctPredictions: number;

  @ApiProperty({
    description: 'Number of incorrect predictions (resolved matches only)',
  })
  incorrectPredictions: number;

  @ApiProperty({
    description: 'Number of pending predictions (unresolved matches)',
  })
  pendingPredictions: number;

  @ApiProperty({ description: 'Accuracy percentage (0-100)' })
  accuracyPercentage: number;

  @ApiProperty({ description: 'User rank compared to other participants' })
  rank: number;

  @ApiProperty({
    description: 'Whether user is a winner (all predictions correct)',
  })
  isWinner: boolean;

  @ApiProperty({ description: 'Total points earned by the user' })
  totalPoints: number;
}
