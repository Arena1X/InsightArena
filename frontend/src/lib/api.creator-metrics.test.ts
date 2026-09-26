import { describe, expect, it } from 'vitest';

import {
  aggregateCreatorMetrics,
  DEFAULT_CREATOR_FEE_BPS,
  sortCreatorMarkets,
  toCreatorMarketMetrics,
  type CreatorMarketResponse,
} from './api';

const RAW_MARKETS: CreatorMarketResponse[] = [
  {
    id: 'm1',
    title: 'Open market',
    total_pool_stroops: '25000000000', // 2,500 XLM
    participant_count: 40,
    is_resolved: false,
    is_cancelled: false,
    created_at: '2026-03-01T00:00:00Z',
  },
  {
    id: 'm2',
    title: 'Resolved market',
    total_pool_stroops: '100000000000', // 10,000 XLM
    participant_count: 120,
    is_resolved: true,
    is_cancelled: false,
    created_at: '2026-01-01T00:00:00Z',
    creator_fee_bps: 250,
  },
  {
    id: 'm3',
    title: 'Cancelled market',
    total_pool_stroops: '5000000000', // 500 XLM
    participant_count: 7,
    is_resolved: false,
    is_cancelled: true,
    created_at: '2026-02-01T00:00:00Z',
  },
  {
    id: 'm4',
    title: 'Resolved default fee',
    total_pool_stroops: '12345678901', // ~1,234.57 XLM
    participant_count: 33,
    is_resolved: true,
    is_cancelled: false,
    created_at: '2026-04-01T00:00:00Z',
  },
];

describe('toCreatorMarketMetrics', () => {
  it('converts stroops to XLM and maps resolution status', () => {
    const [open, resolved, cancelled] = RAW_MARKETS.map(toCreatorMarketMetrics);
    expect(open).toMatchObject({ volumeXlm: 2500, participants: 40, resolutionStatus: 'open', feesEarnedXlm: 0 });
    expect(resolved).toMatchObject({ volumeXlm: 10000, resolutionStatus: 'resolved', feesEarnedXlm: 250 });
    expect(cancelled).toMatchObject({ volumeXlm: 500, resolutionStatus: 'cancelled', feesEarnedXlm: 0 });
  });

  it('falls back to the default creator fee when none is provided', () => {
    const metrics = toCreatorMarketMetrics(RAW_MARKETS[3]);
    expect(metrics.feesEarnedXlm).toBeCloseTo((metrics.volumeXlm * DEFAULT_CREATOR_FEE_BPS) / 10_000);
  });
});

describe('aggregateCreatorMetrics', () => {
  it('equals the sum of per-market values', () => {
    const metrics = RAW_MARKETS.map(toCreatorMarketMetrics);
    const totals = aggregateCreatorMetrics(metrics);

    const sum = (pick: (m: (typeof metrics)[number]) => number) =>
      metrics.reduce((acc, m) => acc + pick(m), 0);

    expect(totals.marketCount).toBe(metrics.length);
    expect(totals.volumeXlm).toBeCloseTo(sum((m) => m.volumeXlm));
    expect(totals.participants).toBe(sum((m) => m.participants));
    expect(totals.feesEarnedXlm).toBeCloseTo(sum((m) => m.feesEarnedXlm));
    expect(totals.resolvedCount).toBe(metrics.filter((m) => m.resolutionStatus === 'resolved').length);
  });

  it('returns zeroed totals for no markets', () => {
    expect(aggregateCreatorMetrics([])).toEqual({
      marketCount: 0,
      volumeXlm: 0,
      participants: 0,
      feesEarnedXlm: 0,
      resolvedCount: 0,
    });
  });
});

describe('sortCreatorMarkets', () => {
  const metrics = RAW_MARKETS.map(toCreatorMarketMetrics);

  it('sorts by volume descending', () => {
    expect(sortCreatorMarkets(metrics, 'volume').map((m) => m.id)).toEqual(['m2', 'm1', 'm4', 'm3']);
  });

  it('sorts by recency descending without mutating the input', () => {
    const before = metrics.map((m) => m.id);
    expect(sortCreatorMarkets(metrics, 'recent').map((m) => m.id)).toEqual(['m4', 'm1', 'm3', 'm2']);
    expect(metrics.map((m) => m.id)).toEqual(before);
  });
});
