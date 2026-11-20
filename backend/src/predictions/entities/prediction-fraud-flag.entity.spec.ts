import {
  FraudFlagStatus,
  PredictionFraudFlag,
  canonicalJson,
  hashEvidence,
} from './prediction-fraud-flag.entity';
import { FraudEvidenceImmutableException } from '../exceptions/fraud-evidence-immutable.exception';
import { getMetadataArgsStorage } from 'typeorm';

const loadFlag = (evidence: Record<string, unknown> | null) => {
  const flag = Object.assign(new PredictionFraudFlag(), {
    id: 'flag-1',
    evidence,
  });
  // Simulate TypeORM's AfterLoad hook.
  flag['capturePersistedEvidence']();
  return flag;
};

describe('PredictionFraudFlag evidence immutability', () => {
  it('allows saving a loaded flag whose evidence is unchanged', () => {
    const flag = loadFlag({ deadline: 'a', edited_at: 'b' });
    flag.status = FraudFlagStatus.REVIEWED;

    expect(() => flag['rejectEvidenceMutation']()).not.toThrow();
  });

  it('treats a key-reordered but identical snapshot as unchanged', () => {
    const flag = loadFlag({ deadline: 'a', edited_at: 'b' });
    flag.evidence = { edited_at: 'b', deadline: 'a' };

    expect(() => flag['rejectEvidenceMutation']()).not.toThrow();
  });

  it('rejects an update that changes existing evidence', () => {
    const flag = loadFlag({ deadline: 'a', edited_at: 'b' });
    flag.evidence = { deadline: 'a', edited_at: 'later' };

    expect(() => flag['rejectEvidenceMutation']()).toThrow(
      FraudEvidenceImmutableException,
    );
  });

  it('rejects clearing existing evidence', () => {
    const flag = loadFlag({ deadline: 'a' });
    flag.evidence = null;

    expect(() => flag['rejectEvidenceMutation']()).toThrow(
      FraudEvidenceImmutableException,
    );
  });

  it('excludes evidence columns from UPDATE statements', () => {
    const columns = getMetadataArgsStorage().columns.filter(
      (c) =>
        c.target === PredictionFraudFlag &&
        ['evidence', 'evidence_hash'].includes(c.propertyName),
    );

    expect(columns).toHaveLength(2);
    columns.forEach((c) => expect(c.options.update).toBe(false));
  });

  it('hashes evidence deterministically regardless of key order', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe(
      '{"a":{"c":3,"d":2},"b":1}',
    );
    expect(hashEvidence({ a: 1, b: 2 })).toBe(hashEvidence({ b: 2, a: 1 }));
  });
});
