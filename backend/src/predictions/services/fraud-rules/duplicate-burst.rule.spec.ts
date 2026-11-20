import { ConfigService } from '@nestjs/config';
import { FindOperator, Repository } from 'typeorm';
import {
  DEFAULT_DUPLICATE_BURST_THRESHOLD,
  DuplicateBurstRule,
} from './duplicate-burst.rule';
import { FraudRuleContext, FraudRuleTrigger } from './fraud-rule.interface';
import { FraudSignalType } from '../../entities/prediction-fraud-flag.entity';
import { Prediction } from '../../entities/prediction.entity';
import { Market } from '../../../markets/entities/market.entity';
import { User } from '../../../users/entities/user.entity';

const NOW = new Date('2026-10-01T12:00:00.000Z');

interface StoredPrediction {
  id: string;
  address: string;
  device: string | null;
  submitted_at: Date;
}

/**
 * In-memory stand-in for the predictions repository that honours the
 * address/device/time-window filters the rule builds.
 */
const makeRepo = (rows: StoredPrediction[]) => ({
  find: jest.fn(
    ({
      where,
    }: {
      where: {
        user?: { stellar_address: string };
        device_fingerprint?: string;
        submitted_at: FindOperator<Date>;
      };
    }) => {
      const [from, to] = where.submitted_at.value as unknown as [Date, Date];
      return Promise.resolve(
        rows
          .filter((r) =>
            where.user
              ? r.address === where.user.stellar_address
              : r.device === where.device_fingerprint,
          )
          .filter(
            (r) =>
              r.submitted_at.getTime() >= from.getTime() &&
              r.submitted_at.getTime() <= to.getTime(),
          )
          .map((r) => ({ id: r.id })),
      );
    },
  ),
});

const makeConfig = (values: Record<string, string | undefined>) =>
  ({
    get: jest.fn((key: string) => values[key]),
  }) as unknown as ConfigService;

const secondsAgo = (s: number) => new Date(NOW.getTime() - s * 1000);

const makeContext = (
  overrides: { device?: string | null; trigger?: FraudRuleTrigger } = {},
): FraudRuleContext => ({
  prediction: {
    id: 'pred-current',
    submitted_at: NOW,
    device_fingerprint: overrides.device ?? null,
  } as Prediction,
  market: { id: 'market-1' } as Market,
  user: { id: 'user-1', stellar_address: 'GADDR' } as User,
  trigger: overrides.trigger ?? FraudRuleTrigger.SUBMIT,
  occurredAt: NOW,
});

const burst = (
  count: number,
  opts: { address?: string; device?: string | null; spacingSeconds: number },
): StoredPrediction[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `pred-${opts.address ?? 'x'}-${opts.device ?? 'x'}-${i}`,
    address: opts.address ?? 'OTHER',
    device: opts.device ?? null,
    submitted_at: secondsAgo(i * opts.spacingSeconds),
  }));

describe('DuplicateBurstRule', () => {
  const config = makeConfig({
    FRAUD_DUPLICATE_BURST_THRESHOLD: '3',
    FRAUD_DUPLICATE_BURST_WINDOW_SECONDS: '60',
  });

  const makeRule = (rows: StoredPrediction[], cfg = config) =>
    new DuplicateBurstRule(
      makeRepo(rows) as unknown as Repository<Prediction>,
      cfg,
    );

  it('uses the duplicate-burst rule id', () => {
    expect(makeRule([]).id).toBe(FraudSignalType.DUPLICATE_BURST);
  });

  it('flags a same-address burst at or above the threshold within the window', async () => {
    const rule = makeRule(burst(3, { address: 'GADDR', spacingSeconds: 10 }));

    const hit = await rule.evaluate(makeContext());

    expect(hit).not.toBeNull();
    expect(hit?.score).toBe(3);
    expect(hit?.threshold).toBe(3);
    expect(hit?.evidence.matches).toEqual([
      expect.objectContaining({ dimension: 'address', key: 'GADDR', count: 3 }),
    ]);
  });

  it('flags a same-device burst across different addresses', async () => {
    const rows: StoredPrediction[] = ['G1', 'G2', 'G3'].map((address, i) => ({
      id: `pred-${address}`,
      address,
      device: 'dev-1',
      submitted_at: secondsAgo(i * 20),
    }));
    const rule = makeRule(rows);

    const hit = await rule.evaluate(makeContext({ device: 'dev-1' }));

    expect(hit?.evidence.matches).toEqual([
      expect.objectContaining({ dimension: 'device', key: 'dev-1', count: 3 }),
    ]);
  });

  it('does not flag activity below the threshold', async () => {
    const rule = makeRule(burst(2, { address: 'GADDR', spacingSeconds: 5 }));

    expect(await rule.evaluate(makeContext())).toBeNull();
  });

  it('does not flag activity spread beyond the window', async () => {
    // 3 predictions, 45s apart: only 2 fall in the trailing 60s window.
    const rule = makeRule(burst(3, { address: 'GADDR', spacingSeconds: 45 }));

    expect(await rule.evaluate(makeContext())).toBeNull();
  });

  it('ignores note edits', async () => {
    const rule = makeRule(burst(5, { address: 'GADDR', spacingSeconds: 1 }));

    expect(
      await rule.evaluate(makeContext({ trigger: FraudRuleTrigger.UPDATE })),
    ).toBeNull();
  });

  it('reads threshold and window from config rather than hardcoding them', async () => {
    const rows = burst(3, { address: 'GADDR', spacingSeconds: 45 });

    // Same activity: not a burst with a 60s window, a burst with 120s.
    expect(await makeRule(rows).evaluate(makeContext())).toBeNull();

    const wideWindow = makeConfig({
      FRAUD_DUPLICATE_BURST_THRESHOLD: '3',
      FRAUD_DUPLICATE_BURST_WINDOW_SECONDS: '120',
    });
    const hit = await makeRule(rows, wideWindow).evaluate(makeContext());
    expect(hit?.evidence.window_seconds).toBe(120);

    // Raising the threshold suppresses the same burst.
    const highThreshold = makeConfig({
      FRAUD_DUPLICATE_BURST_THRESHOLD: '10',
      FRAUD_DUPLICATE_BURST_WINDOW_SECONDS: '120',
    });
    expect(
      await makeRule(rows, highThreshold).evaluate(makeContext()),
    ).toBeNull();

    expect(wideWindow.get).toHaveBeenCalledWith(
      'FRAUD_DUPLICATE_BURST_THRESHOLD',
    );
    expect(wideWindow.get).toHaveBeenCalledWith(
      'FRAUD_DUPLICATE_BURST_WINDOW_SECONDS',
    );
  });

  it('falls back to the default threshold when config is unset', async () => {
    const rule = makeRule(
      burst(DEFAULT_DUPLICATE_BURST_THRESHOLD, {
        address: 'GADDR',
        spacingSeconds: 1,
      }),
      makeConfig({}),
    );

    const hit = await rule.evaluate(makeContext());
    expect(hit?.threshold).toBe(DEFAULT_DUPLICATE_BURST_THRESHOLD);
  });
});
