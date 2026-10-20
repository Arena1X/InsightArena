import { MarketSettlementState } from './entities/market.entity';
import {
  ALLOWED_SETTLEMENT_TRANSITIONS,
  canTransition,
  describeIllegalTransition,
} from './market-settlement-state.util';

describe('market settlement state machine', () => {
  const states = Object.values(MarketSettlementState);

  it.each([
    [MarketSettlementState.PENDING, MarketSettlementState.PROPOSED],
    [MarketSettlementState.PROPOSED, MarketSettlementState.SETTLING],
    [MarketSettlementState.PROPOSED, MarketSettlementState.CHALLENGED],
    [MarketSettlementState.SETTLING, MarketSettlementState.SETTLING],
    [MarketSettlementState.SETTLING, MarketSettlementState.SETTLED],
    [MarketSettlementState.CHALLENGED, MarketSettlementState.SETTLED],
  ])('allows %s -> %s', (from, to) => {
    expect(canTransition(from, to)).toBe(true);
  });

  it('rejects every transition not explicitly allowed', () => {
    for (const from of states) {
      for (const to of states) {
        const expected = ALLOWED_SETTLEMENT_TRANSITIONS[from].includes(to);
        expect(canTransition(from, to)).toBe(expected);
      }
    }
  });

  it('describes the allowed destinations for an illegal transition', () => {
    expect(
      describeIllegalTransition(
        MarketSettlementState.PENDING,
        MarketSettlementState.SETTLED,
      ),
    ).toContain('allowed from "pending": proposed');
  });

  it('describes settled as terminal', () => {
    expect(
      describeIllegalTransition(
        MarketSettlementState.SETTLED,
        MarketSettlementState.PROPOSED,
      ),
    ).toContain('"settled" is a terminal state');
  });

  it('has an entry for every enum member', () => {
    expect(Object.keys(ALLOWED_SETTLEMENT_TRANSITIONS).sort()).toEqual(
      states.sort(),
    );
  });
});
