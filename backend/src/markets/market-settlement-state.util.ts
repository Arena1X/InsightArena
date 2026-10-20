import { MarketSettlementState } from './entities/market.entity';

/**
 * The allowed lifecycle transitions for the market settlement state machine.
 * `SETTLING -> SETTLING` is intentional: a scheduler retry may reclaim a
 * market left in that state after a process crash.
 */
export const ALLOWED_SETTLEMENT_TRANSITIONS: Readonly<
  Record<MarketSettlementState, readonly MarketSettlementState[]>
> = {
  [MarketSettlementState.PENDING]: [MarketSettlementState.PROPOSED],
  [MarketSettlementState.PROPOSED]: [
    MarketSettlementState.SETTLING,
    MarketSettlementState.CHALLENGED,
  ],
  [MarketSettlementState.SETTLING]: [
    MarketSettlementState.SETTLING,
    MarketSettlementState.SETTLED,
  ],
  [MarketSettlementState.CHALLENGED]: [MarketSettlementState.SETTLED],
  [MarketSettlementState.SETTLED]: [],
};

export function canTransition(
  from: MarketSettlementState,
  to: MarketSettlementState,
): boolean {
  return ALLOWED_SETTLEMENT_TRANSITIONS[from].includes(to);
}

export function describeIllegalTransition(
  from: MarketSettlementState,
  to: MarketSettlementState,
): string {
  const allowed = ALLOWED_SETTLEMENT_TRANSITIONS[from];
  if (allowed.length === 0) {
    return `Cannot move market settlement from "${from}" to "${to}" ("${from}" is a terminal state)`;
  }
  return `Cannot move market settlement from "${from}" to "${to}" (allowed from "${from}": ${allowed.join(', ')})`;
}
