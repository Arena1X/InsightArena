import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { PredictionFraudRulesService } from './prediction-fraud-rules.service';
import { PostDeadlineEditRule } from './fraud-rules/post-deadline-edit.rule';
import { DuplicateBurstRule } from './fraud-rules/duplicate-burst.rule';
import {
  FraudRuleContext,
  FraudRuleTrigger,
} from './fraud-rules/fraud-rule.interface';
import {
  FraudFlagStatus,
  FraudSignalType,
  PredictionFraudFlag,
  hashEvidence,
} from '../entities/prediction-fraud-flag.entity';
import { Prediction } from '../entities/prediction.entity';
import { Market } from '../../markets/entities/market.entity';
import { User } from '../../users/entities/user.entity';
import { FraudEvidenceImmutableException } from '../exceptions/fraud-evidence-immutable.exception';

const DEADLINE = new Date('2026-10-01T12:00:00.000Z');

/** In-memory flags table that runs the entity's insert/update hooks. */
const makeFlagsRepo = () => {
  const rows: PredictionFraudFlag[] = [];
  let seq = 0;
  return {
    rows,
    findOne: jest.fn(
      ({ where }: { where: { prediction_id: string; rule_id: string } }) =>
        Promise.resolve(
          rows.find(
            (r) =>
              r.prediction_id === where.prediction_id &&
              r.rule_id === where.rule_id,
          ) ?? null,
        ),
    ),
    create: jest.fn((data: Partial<PredictionFraudFlag>) =>
      Object.assign(new PredictionFraudFlag(), data),
    ),
    save: jest.fn((flag: PredictionFraudFlag) =>
      Promise.resolve().then(() => {
        if (flag.id) {
          flag['rejectEvidenceMutation']();
          return flag;
        }
        flag.id = `flag-${++seq}`;
        flag['capturePersistedEvidence']();
        rows.push(flag);
        return flag;
      }),
    ),
  };
};

const makeConfig = (values: Record<string, string> = {}) =>
  ({
    get: jest.fn((key: string) => values[key]),
  }) as unknown as ConfigService;

const makeContext = (
  overrides: Partial<FraudRuleContext> = {},
): FraudRuleContext => ({
  prediction: {
    id: 'pred-1',
    chosen_outcome: 'Yes',
    note: 'original note',
    submitted_at: new Date(DEADLINE.getTime() - 3_600_000),
    device_fingerprint: null,
  } as Prediction,
  market: { id: 'market-1', end_time: DEADLINE } as Market,
  user: { id: 'user-1', stellar_address: 'GADDR' } as User,
  trigger: FraudRuleTrigger.UPDATE,
  occurredAt: new Date(DEADLINE.getTime() - 60_000),
  ...overrides,
});

const afterDeadline = (seconds: number) =>
  new Date(DEADLINE.getTime() + seconds * 1000);

describe('PredictionFraudRulesService', () => {
  let flagsRepo: ReturnType<typeof makeFlagsRepo>;
  let predictionsFind: jest.Mock;

  const makeService = (config = makeConfig()) =>
    new PredictionFraudRulesService(
      flagsRepo as unknown as Repository<PredictionFraudFlag>,
      config,
      new PostDeadlineEditRule(),
      new DuplicateBurstRule(
        { find: predictionsFind } as unknown as Repository<Prediction>,
        config,
      ),
    );

  beforeEach(() => {
    flagsRepo = makeFlagsRepo();
    predictionsFind = jest.fn().mockResolvedValue([]);
  });

  describe('rule set', () => {
    it('does not flag a benign prediction with any rule', async () => {
      const service = makeService();

      const submitFlags = await service.evaluate(
        makeContext({ trigger: FraudRuleTrigger.SUBMIT }),
      );
      const updateFlags = await service.evaluate(makeContext());

      expect(submitFlags).toEqual([]);
      expect(updateFlags).toEqual([]);
      expect(flagsRepo.save).not.toHaveBeenCalled();
    });

    it('flags a post-deadline edit', async () => {
      const flags = await makeService().evaluate(
        makeContext({ occurredAt: afterDeadline(30) }),
      );

      expect(flags).toHaveLength(1);
      expect(flags[0].rule_id).toBe(FraudSignalType.POST_DEADLINE_EDIT);
    });

    it('flags a duplicate burst', async () => {
      predictionsFind.mockResolvedValue(
        Array.from({ length: 5 }, (_, i) => ({ id: `p-${i}` })),
      );

      const flags = await makeService().evaluate(
        makeContext({ trigger: FraudRuleTrigger.SUBMIT }),
      );

      expect(flags).toHaveLength(1);
      expect(flags[0].rule_id).toBe(FraudSignalType.DUPLICATE_BURST);
    });

    it('lets each rule be disabled independently', async () => {
      predictionsFind.mockResolvedValue(
        Array.from({ length: 5 }, (_, i) => ({ id: `p-${i}` })),
      );
      const context = makeContext({
        trigger: FraudRuleTrigger.SUBMIT,
        occurredAt: afterDeadline(10),
      });

      const deadlineOff = await makeService(
        makeConfig({ FRAUD_RULE_POST_DEADLINE_EDIT_ENABLED: 'false' }),
      ).evaluate(context);
      expect(deadlineOff.map((f) => f.rule_id)).toEqual([
        FraudSignalType.DUPLICATE_BURST,
      ]);

      flagsRepo = makeFlagsRepo();
      const burstOff = await makeService(
        makeConfig({ FRAUD_RULE_DUPLICATE_BURST_ENABLED: 'false' }),
      ).evaluate(context);
      expect(burstOff.map((f) => f.rule_id)).toEqual([
        FraudSignalType.POST_DEADLINE_EDIT,
      ]);
    });
  });

  describe('persisted flags', () => {
    it('records the rule id and an evidence snapshot', async () => {
      const editedAt = afterDeadline(45);
      const [flag] = await makeService().evaluate(
        makeContext({ occurredAt: editedAt }),
      );

      expect(flagsRepo.rows).toHaveLength(1);
      expect(flag).toMatchObject({
        user_id: 'user-1',
        prediction_id: 'pred-1',
        rule_id: FraudSignalType.POST_DEADLINE_EDIT,
        signal_type: FraudSignalType.POST_DEADLINE_EDIT,
        status: FraudFlagStatus.OPEN,
      });
      expect(flag.evidence).toMatchObject({
        deadline: DEADLINE.toISOString(),
        edited_at: editedAt.toISOString(),
        note: 'original note',
      });
      expect(flag.evidence_hash).toBe(
        hashEvidence(flag.evidence as Record<string, unknown>),
      );
    });

    it('persists evidence exactly as captured at creation', async () => {
      const context = makeContext({ occurredAt: afterDeadline(5) });
      const [flag] = await makeService().evaluate(context);
      const captured = JSON.parse(JSON.stringify(flag.evidence)) as Record<
        string,
        unknown
      >;

      // Later changes to the live prediction must not leak into the snapshot.
      context.prediction.note = 'rewritten note';
      context.prediction.chosen_outcome = 'No';

      expect(flagsRepo.rows[0].evidence).toEqual(captured);
      expect(makeService().verifyEvidence(flagsRepo.rows[0])).toBe(true);
    });

    it('rejects mutating an existing flag evidence', async () => {
      const [flag] = await makeService().evaluate(
        makeContext({ occurredAt: afterDeadline(5) }),
      );

      flag.evidence = { ...flag.evidence, note: 'tampered' };

      await expect(
        (flagsRepo as unknown as Repository<PredictionFraudFlag>).save(flag),
      ).rejects.toBeInstanceOf(FraudEvidenceImmutableException);
    });

    it('does not overwrite prior evidence when a rule re-runs on the same prediction', async () => {
      const service = makeService();
      const [first] = await service.evaluate(
        makeContext({ occurredAt: afterDeadline(5) }),
      );
      const original = JSON.parse(JSON.stringify(first.evidence)) as Record<
        string,
        unknown
      >;

      const context = makeContext({ occurredAt: afterDeadline(500) });
      context.prediction.note = 'second late edit';
      const [second] = await service.evaluate(context);

      expect(second.id).toBe(first.id);
      expect(flagsRepo.rows).toHaveLength(1);
      expect(flagsRepo.save).toHaveBeenCalledTimes(1);
      expect(flagsRepo.rows[0].evidence).toEqual(original);
    });

    it('detects tampering via the evidence hash', async () => {
      const service = makeService();
      const [flag] = await service.evaluate(
        makeContext({ occurredAt: afterDeadline(5) }),
      );

      expect(service.verifyEvidence(flag)).toBe(true);
      (flag.evidence as Record<string, unknown>).note = 'tampered';
      expect(service.verifyEvidence(flag)).toBe(false);
    });
  });
});
