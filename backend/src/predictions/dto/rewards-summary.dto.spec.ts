import {
  RewardsSummaryDto,
  formatStroopsAsXlm,
  parseStroops,
  stroopsToXlm,
} from './rewards-summary.dto';

describe('RewardsSummaryDto precision', () => {
  it('round-trips reward amounts through the serialized DTO without precision loss', () => {
    const totals = {
      // Larger than Number.MAX_SAFE_INTEGER: a float would lose the last digit.
      totalEarned: 9007199254740993n,
      claimable: 1n,
      vesting: 123456789012345678n,
    };

    const serialized = JSON.stringify(RewardsSummaryDto.fromStroops(totals));
    const parsed = JSON.parse(serialized) as RewardsSummaryDto;

    expect(parseStroops(parsed.total_earned_stroops)).toBe(totals.totalEarned);
    expect(parseStroops(parsed.claimable_stroops)).toBe(totals.claimable);
    expect(parseStroops(parsed.vesting_stroops)).toBe(totals.vesting);
  });

  it('sums reward amounts exactly', () => {
    const amounts = ['1000000', '2000000', '1', '9007199254740993'];

    const total = amounts.reduce((acc, a) => acc + parseStroops(a), 0n);
    const summary = RewardsSummaryDto.fromStroops({
      totalEarned: total,
      claimable: 0n,
      vesting: 0n,
    });

    expect(summary.total_earned_stroops).toBe('9007199257740994');
    expect(formatStroopsAsXlm(total)).toBe('900719925.7740994');
  });

  it('does not truncate very small amounts to zero', () => {
    expect(formatStroopsAsXlm(1n)).toBe('0.0000001');
    expect(stroopsToXlm(1n)).toBe(0.0000001);
    expect(stroopsToXlm(1n)).toBeGreaterThan(0);

    const summary = RewardsSummaryDto.fromStroops({
      totalEarned: 0n,
      claimable: 1n,
      vesting: 0n,
    });
    expect(summary.claimable_stroops).toBe('1');
    expect(summary.claimable_xlm).toBe(0.0000001);
  });

  it('formats negative and whole amounts exactly and reports zero as +0', () => {
    expect(formatStroopsAsXlm(-15000000n)).toBe('-1.5');
    expect(formatStroopsAsXlm(20000000n)).toBe('2');
    expect(Object.is(stroopsToXlm(0n), 0)).toBe(true);
  });
});
