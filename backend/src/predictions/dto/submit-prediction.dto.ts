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
