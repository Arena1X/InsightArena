import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BATCH_PREDICTION_STATUS } from './batch-submit-response.dto';
import type { BatchPredictionStatus } from './batch-submit-response.dto';

/**
 * Reward amounts are tracked on-chain in stroops (1 XLM = 10^7 stroops) and
 * must never be computed with binary floats. The precision policy is:
 *
 * - All arithmetic (summing, subtracting) is done on integer stroops as
 *   `bigint`.
 * - The exact amount is serialized as a decimal integer string of stroops
 *   (`*_stroops` fields), which round-trips through JSON without loss.
 * - The `*_xlm` number fields are display conveniences, converted once from
 *   the exact stroop total via its decimal representation, so even a single
 *   stroop is reported as 0.0000001 rather than truncated to zero.
 */
export const STROOPS_PER_XLM = 10_000_000n;
const XLM_DECIMALS = 7;

/** Parses a stored stroop amount (decimal integer string) into a bigint. */
export function parseStroops(value: string | null | undefined): bigint {
  return BigInt(value ?? '0');
}

/**
 * Formats a (possibly negative) stroop amount as an exact decimal XLM string,
 * e.g. `1n` -> `"0.0000001"`, `-15000000n` -> `"-1.5"`.
 */
export function formatStroopsAsXlm(stroops: bigint): string {
  const negative = stroops < 0n;
  const abs = negative ? -stroops : stroops;
  const whole = abs / STROOPS_PER_XLM;
  const fraction = (abs % STROOPS_PER_XLM)
    .toString()
    .padStart(XLM_DECIMALS, '0')
    .replace(/0+$/, '');
  const body = fraction ? `${whole}.${fraction}` : whole.toString();
  return negative ? `-${body}` : body;
}

/**
 * Converts an exact stroop amount to an XLM number in a single step, by
 * parsing its exact decimal representation (round-half-to-even to the
 * nearest double). Zero is always reported as exactly `0`, never `-0`.
 */
export function stroopsToXlm(stroops: bigint): number {
  return stroops === 0n ? 0 : Number(formatStroopsAsXlm(stroops));
}

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

  @ApiProperty({
    description:
      'Exact total payout already claimed, in stroops (decimal integer string).',
    example: '1285000000',
  })
  total_earned_stroops: string;

  @ApiProperty({
    description:
      'Exact claimable stake, in stroops (decimal integer string). ' +
      'Same lower-bound semantics as claimable_xlm.',
    example: '420000000',
  })
  claimable_stroops: string;

  @ApiProperty({
    description:
      'Exact stake in unresolved markets, in stroops (decimal integer string).',
    example: '150000000',
  })
  vesting_stroops: string;

  /**
   * Builds the summary from exact stroop totals so the `*_stroops` and
   * `*_xlm` fields are always derived from the same integer amounts.
   */
  static fromStroops(totals: {
    totalEarned: bigint;
    claimable: bigint;
    vesting: bigint;
  }): RewardsSummaryDto {
    return {
      total_earned_xlm: stroopsToXlm(totals.totalEarned),
      claimable_xlm: stroopsToXlm(totals.claimable),
      vesting_xlm: stroopsToXlm(totals.vesting),
      total_earned_stroops: totals.totalEarned.toString(),
      claimable_stroops: totals.claimable.toString(),
      vesting_stroops: totals.vesting.toString(),
    };
  }
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
    description:
      'Exact total amount claimed in this request, in stroops (decimal integer string).',
    example: '420000000',
  })
  claimed_stroops: string;

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
