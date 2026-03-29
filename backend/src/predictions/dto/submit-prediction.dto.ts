import { IsString, IsUUID, IsNumberString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

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
}
