/**
 * Order preview calculation utilities.
 *
 * Fee:      2% of stake
 * Slippage: 0.5% of stake (estimated price impact)
 * Payout:   (stake - fee) * odds
 */

export const FEE_RATE = 0.02; // 2%
export const SLIPPAGE_RATE = 0.005; // 0.5%

export interface OrderPreview {
  stake: number;
  fee: number;
  slippage: number;
  netStake: number;
  expectedPayout: number;
  odds: number;
}

export function computeOrderPreview(stake: number, odds: number): OrderPreview {
  const fee = stake * FEE_RATE;
  const slippage = stake * SLIPPAGE_RATE;
  const netStake = stake - fee;
  const expectedPayout = netStake * odds;
  return { stake, fee, slippage, netStake, expectedPayout, odds };
}
