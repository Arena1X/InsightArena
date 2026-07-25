import { ApiProperty } from '@nestjs/swagger';

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

export class ClaimAllRewardsResponseDto {
  @ApiProperty({
    description: 'Total amount claimed in this request, in XLM.',
    example: 42,
  })
  claimed_xlm: number;

  @ApiProperty({
    description: 'Number of predictions claimed in this request.',
    example: 3,
  })
  claimed_count: number;

  @ApiProperty({
    description: 'Transaction hash of the most recently submitted claim.',
    example: 'a1b2c3...',
  })
  transaction_hash: string;

  @ApiProperty({ type: RewardsSummaryDto })
  summary: RewardsSummaryDto;
}
