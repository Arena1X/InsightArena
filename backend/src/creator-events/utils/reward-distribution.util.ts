import { RewardDistribution } from '../../contract/contract.service';

export function validateRewardDistribution(
  distribution: RewardDistribution | undefined | null,
): { valid: boolean; error?: string } {
  if (!distribution) {
    return { valid: true };
  }

  const total =
    (distribution.rank1 ?? 0) +
    (distribution.rank2 ?? 0) +
    (distribution.rank3 ?? 0) +
    (distribution.rank4 ?? 0) +
    (distribution.rank5 ?? 0);

  if (total !== 100) {
    return {
      valid: false,
      error: `Reward distribution must sum to 100%, got ${total}%`,
    };
  }

  const hasNegative = Object.values(distribution).some((v) => (v ?? 0) < 0);
  if (hasNegative) {
    return {
      valid: false,
      error: 'Reward distribution percentages cannot be negative',
    };
  }

  return { valid: true };
}

export function toRewardDistributionDto(
  distribution: RewardDistribution | undefined | null,
):
  | {
      rank1: number;
      rank2: number;
      rank3: number;
      rank4?: number;
      rank5?: number;
    }
  | undefined {
  if (!distribution) return undefined;

  const dto: {
    rank1: number;
    rank2: number;
    rank3: number;
    rank4?: number;
    rank5?: number;
  } = {
    rank1: distribution.rank1 ?? 0,
    rank2: distribution.rank2 ?? 0,
    rank3: distribution.rank3 ?? 0,
  };

  if (distribution.rank4 !== undefined && distribution.rank4 !== null) {
    dto.rank4 = distribution.rank4;
  }
  if (distribution.rank5 !== undefined && distribution.rank5 !== null) {
    dto.rank5 = distribution.rank5;
  }

  return dto;
}
