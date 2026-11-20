import { PostDeadlineEditRule } from './post-deadline-edit.rule';
import { FraudRuleContext, FraudRuleTrigger } from './fraud-rule.interface';
import { FraudSignalType } from '../../entities/prediction-fraud-flag.entity';
import { Prediction } from '../../entities/prediction.entity';
import { Market } from '../../../markets/entities/market.entity';
import { User } from '../../../users/entities/user.entity';

const DEADLINE = new Date('2026-10-01T12:00:00.000Z');

const makeContext = (occurredAt: Date): FraudRuleContext => ({
  prediction: {
    id: 'pred-1',
    chosen_outcome: 'Yes',
    note: 'edited note',
  } as Prediction,
  market: { id: 'market-1', end_time: DEADLINE } as Market,
  user: { id: 'user-1', stellar_address: 'GABC' } as User,
  trigger: FraudRuleTrigger.UPDATE,
  occurredAt,
});

describe('PostDeadlineEditRule', () => {
  let rule: PostDeadlineEditRule;

  beforeEach(() => {
    rule = new PostDeadlineEditRule();
  });

  it('uses the post-deadline rule id', () => {
    expect(rule.id).toBe(FraudSignalType.POST_DEADLINE_EDIT);
  });

  it('flags an edit made after the market deadline', async () => {
    const hit = await rule.evaluate(
      makeContext(new Date(DEADLINE.getTime() + 90_000)),
    );

    expect(hit).not.toBeNull();
    expect(hit?.score).toBe(90);
    expect(hit?.evidence).toMatchObject({
      trigger: FraudRuleTrigger.UPDATE,
      prediction_id: 'pred-1',
      market_id: 'market-1',
      seconds_after_deadline: 90,
    });
  });

  it('does not flag an edit made before the deadline', async () => {
    const hit = await rule.evaluate(
      makeContext(new Date(DEADLINE.getTime() - 60_000)),
    );

    expect(hit).toBeNull();
  });

  it('does not flag an edit made exactly at the deadline', async () => {
    expect(await rule.evaluate(makeContext(DEADLINE))).toBeNull();
  });

  it('records both the deadline and the edit timestamp in the evidence', async () => {
    const editedAt = new Date(DEADLINE.getTime() + 5_000);
    const hit = await rule.evaluate(makeContext(editedAt));

    expect(hit?.evidence.deadline).toBe(DEADLINE.toISOString());
    expect(hit?.evidence.edited_at).toBe(editedAt.toISOString());
  });
});
