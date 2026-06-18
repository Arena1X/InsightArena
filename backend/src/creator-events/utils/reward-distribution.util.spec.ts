import {
  validateRewardDistribution,
  toRewardDistributionDto,
} from './reward-distribution.util';
import { RewardDistribution } from '../../contract/contract.service';

describe('Reward Distribution Utility', () => {
  describe('validateRewardDistribution', () => {
    it('returns valid for null/undefined distribution', () => {
      expect(validateRewardDistribution(null).valid).toBe(true);
      expect(validateRewardDistribution(undefined).valid).toBe(true);
    });

    it('returns valid for distribution summing to 100%', () => {
      const distribution: RewardDistribution = {
        rank1: 40,
        rank2: 30,
        rank3: 20,
        rank4: 5,
        rank5: 5,
      };
      expect(validateRewardDistribution(distribution).valid).toBe(true);
    });

    it('returns valid for distribution with only 3 ranks summing to 100%', () => {
      const distribution: RewardDistribution = {
        rank1: 50,
        rank2: 30,
        rank3: 20,
      };
      expect(validateRewardDistribution(distribution).valid).toBe(true);
    });

    it('returns invalid for distribution not summing to 100%', () => {
      const distribution: RewardDistribution = {
        rank1: 30,
        rank2: 30,
        rank3: 20,
      };
      const result = validateRewardDistribution(distribution);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must sum to 100%');
    });

    it('returns invalid for distribution with negative values', () => {
      const distribution: RewardDistribution = {
        rank1: 50,
        rank2: -10,
        rank3: 60,
      };
      const result = validateRewardDistribution(distribution);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('cannot be negative');
    });
  });

  describe('toRewardDistributionDto', () => {
    it('returns undefined for null/undefined distribution', () => {
      expect(toRewardDistributionDto(null)).toBeUndefined();
      expect(toRewardDistributionDto(undefined)).toBeUndefined();
    });

    it('converts full distribution with all ranks', () => {
      const distribution: RewardDistribution = {
        rank1: 40,
        rank2: 30,
        rank3: 20,
        rank4: 5,
        rank5: 5,
      };
      const result = toRewardDistributionDto(distribution);
      expect(result).toEqual({
        rank1: 40,
        rank2: 30,
        rank3: 20,
        rank4: 5,
        rank5: 5,
      });
    });

    it('omits optional fields when not provided', () => {
      const distribution: RewardDistribution = {
        rank1: 50,
        rank2: 30,
        rank3: 20,
      };
      const result = toRewardDistributionDto(distribution);
      expect(result).toEqual({
        rank1: 50,
        rank2: 30,
        rank3: 20,
      });
      expect(result?.rank4).toBeUndefined();
      expect(result?.rank5).toBeUndefined();
    });

    it('includes rank4 when provided', () => {
      const distribution: RewardDistribution = {
        rank1: 50,
        rank2: 30,
        rank3: 15,
        rank4: 5,
      };
      const result = toRewardDistributionDto(distribution);
      expect(result?.rank4).toBe(5);
      expect(result?.rank5).toBeUndefined();
    });
  });
});
