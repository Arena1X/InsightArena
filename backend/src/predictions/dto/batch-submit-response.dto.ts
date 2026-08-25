import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Prediction } from '../entities/prediction.entity';

export const BATCH_PREDICTION_STATUS = {
  FULFILLED: 'fulfilled',
  REJECTED: 'rejected',
} as const;

export type BatchPredictionStatus =
  (typeof BATCH_PREDICTION_STATUS)[keyof typeof BATCH_PREDICTION_STATUS];

export class BatchPredictionResultDto {
  @ApiProperty({
    description: 'Zero-based position of the item in the submitted slip',
    example: 0,
  })
  index!: number;

  @ApiProperty({ description: 'Market the item referred to' })
  market_id!: string;

  @ApiProperty({
    description: 'Whether the item was submitted or rejected',
    enum: [BATCH_PREDICTION_STATUS.FULFILLED, BATCH_PREDICTION_STATUS.REJECTED],
    example: BATCH_PREDICTION_STATUS.FULFILLED,
  })
  status!: BatchPredictionStatus;

  @ApiPropertyOptional({
    description: 'Persisted prediction (only when fulfilled)',
    type: () => Prediction,
  })
  prediction?: Prediction;

  @ApiPropertyOptional({
    description: 'Realized price reported by the on-chain call',
    example: '5000000',
  })
  realized_price?: string;

  @ApiPropertyOptional({
    description: 'Shares received reported by the on-chain call',
    example: '2000000',
  })
  shares_received?: string;

  @ApiPropertyOptional({
    description: 'Rejection reason (only when rejected)',
    example: 'You have already submitted a prediction for this market',
  })
  error?: string;
}

export class BatchSubmitResponseDto {
  @ApiProperty({
    description: 'Per-item outcome, in the order of the submitted slip',
    type: [BatchPredictionResultDto],
  })
  results!: BatchPredictionResultDto[];

  @ApiProperty({ description: 'Number of items fulfilled', example: 3 })
  succeeded!: number;

  @ApiProperty({ description: 'Number of items rejected', example: 1 })
  failed!: number;

  @ApiProperty({
    description: 'Whether the slip was processed atomically',
    example: true,
  })
  atomic!: boolean;
}
