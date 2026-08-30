import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsNumberString,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/** Hard cap on predictions per batch submission. */
export const MAX_BATCH_PREDICTIONS = 20;

export class BatchPredictionItemDto {
  @ApiProperty({
    description: 'UUID of the market to predict on',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @IsUUID()
  market_id!: string;

  @ApiProperty({
    description:
      'Chosen outcome - must match one of the market outcome options',
    example: 'Yes',
  })
  @IsString()
  @MinLength(1)
  chosen_outcome!: string;

  @ApiProperty({
    description: 'Stake amount in stroops (1 XLM = 10^7 stroops)',
    example: '10000000',
  })
  @IsNumberString()
  stake_amount_stroops!: string;

  @ApiProperty({
    description:
      'Client-supplied idempotency key (UUID4 format) unique per (user, market). Used to prevent duplicate submissions within batch and enable idempotent retries.',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  @IsUUID('4', {
    message: 'clientIdempotencyKey must be a valid UUID4',
  })
  clientIdempotencyKey!: string;

  @ApiPropertyOptional({
    description: 'Maximum acceptable price for slippage protection (optional)',
    example: '5000000',
  })
  @IsOptional()
  @IsNumberString()
  maxPrice?: string;

  @ApiPropertyOptional({
    description:
      'Minimum acceptable shares out for slippage protection (optional)',
    example: '2000000',
  })
  @IsOptional()
  @IsNumberString()
  minSharesOut?: string;
}

export class SubmitBatchPredictionsDto {
  @ApiProperty({
    description: `The prediction slip - between 1 and ${MAX_BATCH_PREDICTIONS} items`,
    type: [BatchPredictionItemDto],
    maxItems: MAX_BATCH_PREDICTIONS,
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(MAX_BATCH_PREDICTIONS)
  @ValidateNested({ each: true })
  @Type(() => BatchPredictionItemDto)
  predictions!: BatchPredictionItemDto[];

  @ApiProperty({
    description:
      'Client-supplied idempotency key (UUID4 format) unique per batch submission. Used to prevent duplicate batch submissions and enable safe retries. Same key returns the existing batch result.',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  @IsUUID('4', {
    message: 'clientIdempotencyKey must be a valid UUID4',
  })
  clientIdempotencyKey!: string;

  @ApiPropertyOptional({
    description:
      'When true (default), the entire slip is rejected if any item fails validation or on-chain submission. When false, valid items are submitted individually and failures are reported per item.',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  atomic?: boolean;
}
