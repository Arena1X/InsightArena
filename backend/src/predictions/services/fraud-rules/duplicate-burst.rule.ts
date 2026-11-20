import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, FindOptionsWhere, Repository } from 'typeorm';
import { Prediction } from '../../entities/prediction.entity';
import { FraudSignalType } from '../../entities/prediction-fraud-flag.entity';
import {
  FraudRuleContext,
  FraudRuleHit,
  FraudRuleTrigger,
  PredictionFraudRule,
  readIntConfig,
} from './fraud-rule.interface';

export const DEFAULT_DUPLICATE_BURST_THRESHOLD = 5;
export const DEFAULT_DUPLICATE_BURST_WINDOW_SECONDS = 60;

interface BurstMatch {
  dimension: 'address' | 'device';
  key: string;
  count: number;
  prediction_ids: string[];
}

/**
 * Flags N+ predictions coming from the same stellar address or the same
 * device fingerprint inside a short window - a sybil/collusion pattern.
 * Threshold and window come from FRAUD_DUPLICATE_BURST_THRESHOLD and
 * FRAUD_DUPLICATE_BURST_WINDOW_SECONDS.
 */
@Injectable()
export class DuplicateBurstRule implements PredictionFraudRule {
  readonly id = FraudSignalType.DUPLICATE_BURST;
  readonly enabledConfigKey = 'FRAUD_RULE_DUPLICATE_BURST_ENABLED';

  constructor(
    @InjectRepository(Prediction)
    private readonly predictionsRepository: Repository<Prediction>,
    private readonly configService: ConfigService,
  ) {}

  async evaluate(context: FraudRuleContext): Promise<FraudRuleHit | null> {
    // Note edits don't create new predictions, so they can't form a burst.
    if (context.trigger !== FraudRuleTrigger.SUBMIT) {
      return null;
    }

    const threshold = readIntConfig(
      this.configService,
      'FRAUD_DUPLICATE_BURST_THRESHOLD',
      DEFAULT_DUPLICATE_BURST_THRESHOLD,
    );
    const windowSeconds = readIntConfig(
      this.configService,
      'FRAUD_DUPLICATE_BURST_WINDOW_SECONDS',
      DEFAULT_DUPLICATE_BURST_WINDOW_SECONDS,
    );

    const windowEnd = context.prediction.submitted_at
      ? new Date(context.prediction.submitted_at)
      : context.occurredAt;
    const windowStart = new Date(windowEnd.getTime() - windowSeconds * 1000);
    const submittedAt = Between(windowStart, windowEnd);

    const matches: BurstMatch[] = [];

    const address = context.user.stellar_address;
    if (address) {
      const match = await this.findBurst(
        'address',
        address,
        { user: { stellar_address: address }, submitted_at: submittedAt },
        threshold,
      );
      if (match) matches.push(match);
    }

    const fingerprint = context.prediction.device_fingerprint;
    if (fingerprint) {
      const match = await this.findBurst(
        'device',
        fingerprint,
        { device_fingerprint: fingerprint, submitted_at: submittedAt },
        threshold,
      );
      if (match) matches.push(match);
    }

    if (matches.length === 0) {
      return null;
    }

    return {
      score: Math.max(...matches.map((m) => m.count)),
      threshold,
      evidence: {
        prediction_id: context.prediction.id,
        user_id: context.user.id,
        window_seconds: windowSeconds,
        window_start: windowStart.toISOString(),
        window_end: windowEnd.toISOString(),
        threshold,
        matches,
      },
    };
  }

  private async findBurst(
    dimension: BurstMatch['dimension'],
    key: string,
    where: FindOptionsWhere<Prediction>,
    threshold: number,
  ): Promise<BurstMatch | null> {
    const predictions = await this.predictionsRepository.find({
      where,
      select: { id: true },
      order: { submitted_at: 'ASC' },
    });

    if (predictions.length < threshold) {
      return null;
    }

    return {
      dimension,
      key,
      count: predictions.length,
      prediction_ids: predictions.map((p) => p.id),
    };
  }
}
