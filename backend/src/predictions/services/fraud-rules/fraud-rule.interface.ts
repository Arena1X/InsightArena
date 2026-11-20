import { ConfigService } from '@nestjs/config';
import { Prediction } from '../../entities/prediction.entity';
import { FraudSignalType } from '../../entities/prediction-fraud-flag.entity';
import { Market } from '../../../markets/entities/market.entity';
import { User } from '../../../users/entities/user.entity';

/** Lifecycle event that caused the rules to run. */
export enum FraudRuleTrigger {
  SUBMIT = 'submit',
  UPDATE = 'update',
}

export interface FraudRuleContext {
  prediction: Prediction;
  market: Market;
  user: User;
  trigger: FraudRuleTrigger;
  /** When the submit/edit being evaluated happened. */
  occurredAt: Date;
}

export interface FraudRuleHit {
  score: number;
  threshold: number;
  /** Snapshot of the state that justified the flag at detection time. */
  evidence: Record<string, unknown>;
}

/**
 * A single, independently toggleable fraud rule evaluated against one
 * prediction. Rules only detect - persistence is owned by
 * PredictionFraudRulesService.
 */
export interface PredictionFraudRule {
  readonly id: FraudSignalType;
  /** Config key that disables the rule when set to "false"/"0". */
  readonly enabledConfigKey: string;
  evaluate(context: FraudRuleContext): Promise<FraudRuleHit | null>;
}

export function readIntConfig(
  configService: ConfigService,
  key: string,
  fallback: number,
): number {
  const raw = configService.get<string | number>(key);
  const parsed = raw !== undefined && raw !== null ? Number(raw) : NaN;
  return Number.isFinite(parsed) ? Math.floor(parsed) : fallback;
}
