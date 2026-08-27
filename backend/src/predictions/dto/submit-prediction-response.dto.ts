import { ApiProperty } from '@nestjs/swagger';
import { Prediction } from '../entities/prediction.entity';

export class SubmitPredictionResponseDto {
  @ApiProperty({
    description: 'The submitted prediction',
    type: Prediction,
  })
  prediction: Prediction;

  @ApiProperty({
    description:
      'Realized price per share at execution time (in stroops). Calculated as stake_amount / shares_received.',
    example: '5000000',
  })
  realized_price: string;

  @ApiProperty({
    description: 'Actual shares received from the contract at execution time.',
    example: '2000000',
  })
  shares_received: string;
}
