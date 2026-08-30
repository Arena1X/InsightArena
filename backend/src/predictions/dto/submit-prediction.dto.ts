import {
  IsString,
  IsUUID,
  IsNumberString,
  MinLength,
  IsOptional,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SubmitPredictionDto {
  @ApiProperty({
    description: 'UUID of the market to predict on',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @IsUUID()
  market_id: string;

  @ApiProperty({
    description: 'The outcome the user is predicting',
    example: 'Yes',
  })
  @IsString()
  @MinLength(1)
  chosen_outcome: string;

  @ApiProperty({
    description: 'Stake amount in stroops (1 XLM = 10,000,000 stroops)',
    example: '10000000',
  })
  @IsNumberString()
  stake_amount_stroops: string;

  @ApiProperty({
    description:
      'Client-supplied idempotency key (UUID4 format) unique per (user, market). Used to prevent duplicate submissions and enable safe retries. Same key with same market_id returns the existing prediction.',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  @IsUUID('4', {
    message: 'clientIdempotencyKey must be a valid UUID4',
  })
  clientIdempotencyKey: string;

  @ApiPropertyOptional({
    description:
      'Maximum acceptable price per share. If actual price exceeds this, prediction is rejected with SlippageExceededException. Optional slippage protection.',
    example: '5000000',
  })
  @IsOptional()
  @IsNumberString()
  maxPrice?: string;

  @ApiPropertyOptional({
    description:
      'Minimum acceptable shares received. If actual shares are less than this, prediction is rejected with SlippageExceededException. Optional slippage protection.',
    example: '2000000',
  })
  @IsOptional()
  @IsNumberString()
  minSharesOut?: string;
}
