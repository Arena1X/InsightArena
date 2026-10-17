import { Injectable } from '@nestjs/common';
import { FraudSignalType } from '../../entities/prediction-fraud-flag.entity';
import {
  FraudRuleContext,
  FraudRuleHit,
  PredictionFraudRule,
} from './fraud-rule.interface';

/**
 * Flags a prediction submit/edit (outcome or note) that lands after the
 * market's deadline (`end_time`), when the prediction should be locked.
 */
@Injectable()
export class PostDeadlineEditRule implements PredictionFraudRule {
  readonly id = FraudSignalType.POST_DEADLINE_EDIT;
  readonly enabledConfigKey = 'FRAUD_RULE_POST_DEADLINE_EDIT_ENABLED';

  async evaluate(context: FraudRuleContext): Promise<FraudRuleHit | null> {
    const { prediction, market, trigger, occurredAt } = context;
    if (!market?.end_time) {
      return null;
    }

    const deadline = new Date(market.end_time);
    if (occurredAt.getTime() <= deadline.getTime()) {
      return null;
    }

    const secondsAfterDeadline =
      (occurredAt.getTime() - deadline.getTime()) / 1000;

    return {
      score: secondsAfterDeadline,
      threshold: 0,
      evidence: {
        trigger,
        market_id: market.id,
        prediction_id: prediction.id,
        deadline: deadline.toISOString(),
        edited_at: occurredAt.toISOString(),
        seconds_after_deadline: secondsAfterDeadline,
        chosen_outcome: prediction.chosen_outcome,
        note: prediction.note ?? null,
      },
    };
  }
}
