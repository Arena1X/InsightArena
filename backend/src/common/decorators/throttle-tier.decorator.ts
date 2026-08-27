import { SetMetadata } from '@nestjs/common';

export const THROTTLE_TIER_KEY = 'throttleTier';
export const ThrottleTier = (tier: string) =>
  SetMetadata(THROTTLE_TIER_KEY, tier);
