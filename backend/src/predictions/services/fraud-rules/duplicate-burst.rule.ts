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
export const DEFAULT_MARKET_VELOCITY_THRESHOLD = 10;
export const DEFAULT_MARKET_VELOCITY_WINDOW_SECONDS = 300;

interface BurstMatch {
  dimension: 'address' | 'device' | 'market';
  key: string;
  count: number;
  threshold: number;
  window_seconds: number;
  window_start: string;
  window_end: string;
  prediction_ids: string[];
}

/**
 * Flags N+ predictions coming from the same stellar address or the same
 * device fingerprint inside a short window - a sybil/collusion pattern.
 * Also flags N+ predictions on the same market inside a short window across
 * accounts - a coordinated-burst pattern. Each market holds at most one
 * prediction per user (UQ_prediction_user_market), so the count is already
 * the number of distinct accounts.
 * Thresholds and windows come from FRAUD_DUPLICATE_BURST_* (address/device)
 * and FRAUD_MARKET_VELOCITY_* (market).
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
    const marketThreshold = readIntConfig(
      this.configService,
      'FRAUD_MARKET_VELOCITY_THRESHOLD',
      DEFAULT_MARKET_VELOCITY_THRESHOLD,
    );
    const marketWindowSeconds = readIntConfig(
      this.configService,
      'FRAUD_MARKET_VELOCITY_WINDOW_SECONDS',
      DEFAULT_MARKET_VELOCITY_WINDOW_SECONDS,
    );

    const windowEnd = context.prediction.submitted_at
      ? new Date(context.prediction.submitted_at)
      : context.occurredAt;

    const matches: BurstMatch[] = [];

    const address = context.user.stellar_address;
    if (address) {
      const match = await this.findBurst(
        'address',
        address,
        { user: { stellar_address: address } },
        windowEnd,
        windowSeconds,
        threshold,
      );
      if (match) matches.push(match);
    }

    const fingerprint = context.prediction.device_fingerprint;
    if (fingerprint) {
      const match = await this.findBurst(
        'device',
        fingerprint,
        { device_fingerprint: fingerprint },
        windowEnd,
        windowSeconds,
        threshold,
      );
      if (match) matches.push(match);
    }

    const marketId = context.market?.id;
    if (marketId) {
      const match = await this.findBurst(
        'market',
        marketId,
        { market: { id: marketId } },
        windowEnd,
        marketWindowSeconds,
        marketThreshold,
      );
      if (match) matches.push(match);
    }

    if (matches.length === 0) {
      return null;
    }

    const top = matches.reduce((a, b) => (b.count > a.count ? b : a));

    return {
      score: top.count,
      threshold: top.threshold,
      evidence: {
        prediction_id: context.prediction.id,
        user_id: context.user.id,
        matches,
      },
    };
  }

  private async findBurst(
    dimension: BurstMatch['dimension'],
    key: string,
    where: FindOptionsWhere<Prediction>,
    windowEnd: Date,
    windowSeconds: number,
    threshold: number,
  ): Promise<BurstMatch | null> {
    const windowStart = new Date(windowEnd.getTime() - windowSeconds * 1000);

    const predictions = await this.predictionsRepository.find({
      where: { ...where, submitted_at: Between(windowStart, windowEnd) },
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
      threshold,
      window_seconds: windowSeconds,
      window_start: windowStart.toISOString(),
      window_end: windowEnd.toISOString(),
      prediction_ids: predictions.map((p) => p.id),
    };
  }
}
