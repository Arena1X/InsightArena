import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  FraudFlagStatus,
  PredictionFraudFlag,
  canonicalJson,
  hashEvidence,
} from '../entities/prediction-fraud-flag.entity';
import {
  FraudRuleContext,
  FraudRuleHit,
  PredictionFraudRule,
} from './fraud-rules/fraud-rule.interface';
import { PostDeadlineEditRule } from './fraud-rules/post-deadline-edit.rule';
import { DuplicateBurstRule } from './fraud-rules/duplicate-burst.rule';

const PG_UNIQUE_VIOLATION = '23505';

/**
 * Runs the per-prediction fraud rule set on submit/update and persists one
 * advisory flag per (prediction, rule) with a write-once evidence snapshot.
 * Each rule can be disabled independently via its `enabledConfigKey`.
 */
@Injectable()
export class PredictionFraudRulesService {
  private readonly logger = new Logger(PredictionFraudRulesService.name);
  private readonly rules: PredictionFraudRule[];

  constructor(
    @InjectRepository(PredictionFraudFlag)
    private readonly fraudFlagsRepository: Repository<PredictionFraudFlag>,
    private readonly configService: ConfigService,
    postDeadlineEditRule: PostDeadlineEditRule,
    duplicateBurstRule: DuplicateBurstRule,
  ) {
    this.rules = [postDeadlineEditRule, duplicateBurstRule];
  }

  isRuleEnabled(rule: PredictionFraudRule): boolean {
    const raw = this.configService.get<string | boolean>(rule.enabledConfigKey);
    if (raw === undefined || raw === null || raw === '') {
      return true;
    }
    return !['false', '0', 'off', 'no'].includes(String(raw).toLowerCase());
  }

  /** Evaluate every enabled rule and return the flags raised for this prediction. */
  async evaluate(context: FraudRuleContext): Promise<PredictionFraudFlag[]> {
    const flags: PredictionFraudFlag[] = [];

    for (const rule of this.rules) {
      if (!this.isRuleEnabled(rule)) {
        continue;
      }

      const hit = await rule.evaluate(context);
      if (hit) {
        flags.push(await this.persistFlag(context, rule, hit));
      }
    }

    return flags;
  }

  /** True when the stored evidence still matches the hash taken at creation. */
  verifyEvidence(flag: PredictionFraudFlag): boolean {
    if (!flag.evidence || !flag.evidence_hash) {
      return false;
    }
    return hashEvidence(flag.evidence) === flag.evidence_hash;
  }

  /**
   * Insert a new flag, or return the existing one untouched if this rule has
   * already flagged this prediction - prior evidence is never overwritten.
   */
  private async persistFlag(
    context: FraudRuleContext,
    rule: PredictionFraudRule,
    hit: FraudRuleHit,
  ): Promise<PredictionFraudFlag> {
    const existing = await this.findExisting(context.prediction.id, rule.id);
    if (existing) {
      return existing;
    }

    // Detach the snapshot from any live objects the rule referenced.
    const evidence = JSON.parse(canonicalJson(hit.evidence)) as Record<
      string,
      unknown
    >;

    const flag = this.fraudFlagsRepository.create({
      user_id: context.user.id,
      prediction_id: context.prediction.id,
      rule_id: rule.id,
      signal_type: rule.id,
      score: hit.score,
      threshold: hit.threshold,
      details: { rule_id: rule.id, trigger: context.trigger },
      evidence,
      evidence_hash: hashEvidence(evidence),
      status: FraudFlagStatus.OPEN,
    });

    try {
      const saved = await this.fraudFlagsRepository.save(flag);
      this.logger.warn(
        `Fraud rule "${rule.id}" flagged prediction ${context.prediction.id} for user ${context.user.id}`,
      );
      return saved;
    } catch (err) {
      // A concurrent evaluation inserted the same (prediction, rule) first.
      if ((err as { code?: string })?.code === PG_UNIQUE_VIOLATION) {
        const raced = await this.findExisting(context.prediction.id, rule.id);
        if (raced) return raced;
      }
      throw err;
    }
  }

  private findExisting(
    predictionId: string,
    ruleId: string,
  ): Promise<PredictionFraudFlag | null> {
    return this.fraudFlagsRepository.findOne({
      where: { prediction_id: predictionId, rule_id: ruleId },
    });
  }
}
