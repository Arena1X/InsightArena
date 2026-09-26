import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BATCH_PREDICTION_STATUS } from './batch-submit-response.dto';
import type { BatchPredictionStatus } from './batch-submit-response.dto';

export class RewardsSummaryDto {
  @ApiProperty({
    description:
      'Total payout already claimed across all resolved, won predictions, in XLM.',
    example: 128.5,
  })
  total_earned_xlm: number;

  @ApiProperty({
    description:
      'Stake held in won, resolved predictions that have not been claimed yet, in XLM. ' +
      'This is a lower-bound estimate — the exact payout is determined on-chain at claim time.',
    example: 42,
  })
  claimable_xlm: number;

  @ApiProperty({
    description:
      'Stake held in predictions on markets that have not resolved yet, in XLM.',
    example: 15,
  })
  vesting_xlm: number;
}

export class ClaimResultDto {
  @ApiProperty({ description: 'Prediction this result refers to' })
  prediction_id!: string;

  @ApiProperty({
    description: 'Whether this individual claim succeeded or failed',
    enum: [BATCH_PREDICTION_STATUS.FULFILLED, BATCH_PREDICTION_STATUS.REJECTED],
    example: BATCH_PREDICTION_STATUS.FULFILLED,
  })
  status!: BatchPredictionStatus;

  @ApiPropertyOptional({
    description: 'Transaction hash (only when fulfilled)',
    example: 'a1b2c3...',
  })
  tx_hash?: string;

  @ApiPropertyOptional({
    description: 'Payout amount claimed, in stroops (only when fulfilled)',
    example: '10000000',
  })
  payout_amount_stroops?: string;

  @ApiPropertyOptional({
    description: 'Failure reason (only when rejected)',
    example: 'Soroban claimPayout failed',
  })
  error?: string;
}

export class ClaimAllRewardsResponseDto {
  @ApiProperty({
    description: 'Total amount claimed in this request, in XLM.',
    example: 42,
  })
  claimed_xlm: number;

  @ApiProperty({
    description: 'Number of predictions successfully claimed in this request.',
    example: 3,
  })
  claimed_count: number;

  @ApiProperty({
    description:
      'Transaction hash of the most recently successful claim, or an empty ' +
      'string if every claim in this request failed.',
    example: 'a1b2c3...',
  })
  transaction_hash: string;

  @ApiProperty({
    description:
      'Per-prediction outcome for every claimable prediction attempted in ' +
      'this request, in the order they were processed. A rejected entry ' +
      'does not prevent the others from being attempted.',
    type: [ClaimResultDto],
  })
  results: ClaimResultDto[];

  @ApiProperty({ type: RewardsSummaryDto })
  summary: RewardsSummaryDto;
}
