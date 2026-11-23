import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { OracleSourceReliability } from './entities/oracle-source-reliability.entity';
import { OracleReliabilityHistory } from './entities/oracle-reliability-history.entity';

export interface ReliabilityScoreResponse {
  data_source: string;
  total_submissions: number;
  correct_submissions: number;
  reliability_score: number | null;
  updated_at: string;
}

@Injectable()
export class OracleReliabilityService {
  private readonly logger = new Logger(OracleReliabilityService.name);

  /**
   * Minimum weight floor: a source's weight can never drop below this value,
   * regardless of how poor its accuracy history is. This keeps low-volume or
   * newly-added sources participating in consensus instead of being excluded
   * entirely when their reliability score would otherwise be 0.
   */
  private readonly WEIGHT_FLOOR = 0.1;

  /**
   * Newly-seen oracle sources (no submissions yet) default to this neutral
   * weight until their first outcome is recorded. This treats unknown sources
   * equally with the group before history is available.
   */
  private readonly DEFAULT_WEIGHT = 1.0;

  /**
   * Default decay parameters (configuration-driven via ConfigService).
   *
   * - DECAY_RATE: fraction of the score lost per full decay period of
   *   inactivity (linear decay). 0 disables decay.
   * - DECAY_PERIOD_MS: length of one inactivity period, in milliseconds.
   * - DECAY_FLOOR: the lowest score decay may reduce a source to.
   */
  private readonly DEFAULT_DECAY_RATE = 0.05;
  private readonly DEFAULT_DECAY_PERIOD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
  private readonly DEFAULT_DECAY_FLOOR = 0.1;

  constructor(
    @InjectRepository(OracleSourceReliability)
    private readonly reliabilityRepository: Repository<OracleSourceReliability>,
    @InjectRepository(OracleReliabilityHistory)
    private readonly historyRepository: Repository<OracleReliabilityHistory>,
    private readonly configService: ConfigService,
  ) {}

  private getDecayRate(): number {
    const raw = this.configService?.get<string | number>(
      'ORACLE_RELIABILITY_DECAY_RATE',
    );
    const parsed = raw === undefined || raw === null ? NaN : Number(raw);
    return Number.isFinite(parsed) && parsed >= 0
      ? parsed
      : this.DEFAULT_DECAY_RATE;
  }

  private getDecayPeriodMs(): number {
    const raw = this.configService?.get<string | number>(
      'ORACLE_RELIABILITY_DECAY_PERIOD_MS',
    );
    const parsed = raw === undefined || raw === null ? NaN : Number(raw);
    return Number.isFinite(parsed) && parsed > 0
      ? parsed
      : this.DEFAULT_DECAY_PERIOD_MS;
  }

  private getDecayFloor(): number {
    const raw = this.configService?.get<string | number>(
      'ORACLE_RELIABILITY_DECAY_FLOOR',
    );
    const parsed = raw === undefined || raw === null ? NaN : Number(raw);
    return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1
      ? parsed
      : this.DEFAULT_DECAY_FLOOR;
  }

  /**
   * Compute the decayed reliability score for a record based on the time
   * elapsed since its last activity (updated_at).
   *
   * Decay is linear: for every full DECAY_PERIOD_MS of inactivity the score
   * drops by DECAY_RATE (as a fraction of the score). The result is clamped
   * so it never falls below DECAY_FLOOR. Records with no score (null) are
   * returned unchanged.
   */
  private applyDecay(
    record: OracleSourceReliability,
    now: number = Date.now(),
  ): number | null {
    const score = record.reliability_score;
    if (score === null || score === undefined) {
      return score ?? null;
    }

    const rate = this.getDecayRate();
    if (rate <= 0) {
      return score;
    }

    const periodMs = this.getDecayPeriodMs();
    const floor = this.getDecayFloor();

    const lastActivity = record.updated_at
      ? new Date(record.updated_at).getTime()
      : now;
    const elapsed = Math.max(0, now - lastActivity);
    const periods = Math.floor(elapsed / periodMs);

    if (periods <= 0) {
      return score;
    }

    const decayed = score * Math.pow(1 - rate, periods);
    return Math.max(floor, Math.min(1.0, decayed));
  }

  /**
   * Apply decay to a record and persist the change if the score moved.
   * Returns the (possibly updated) record.
   */
  private async decayAndPersist(
    record: OracleSourceReliability,
  ): Promise<OracleSourceReliability> {
    const decayed = this.applyDecay(record);
    if (decayed === null || decayed === record.reliability_score) {
      return record;
    }

    this.logger.log(
      `Reliability decayed: source=${record.data_source}, ${record.reliability_score?.toFixed(4)} -> ${decayed.toFixed(4)}`,
    );

    record.reliability_score = decayed;
    return this.reliabilityRepository.save(record);
  }

  /**
   * Called when a match outcome is finalized. Records whether the source's
   * submission matched the finalized outcome, updates the running score, and
   * persists a history record for audit and consensus reconstruction.
   *
   * Score is computed as: correct_submissions / total_submissions, bounded [0, 1].
   *
   * @param dataSource The oracle source identifier
   * @param matchId The match that was resolved
   * @param wasCorrect Whether this oracle's submission matched the final outcome
   * @returns Updated reliability record
   */
  async recordOutcome(
    dataSource: string,
    matchId: string,
    wasCorrect: boolean,
  ): Promise<OracleSourceReliability> {
    let record = await this.reliabilityRepository.findOne({
      where: { data_source: dataSource },
    });

    // Apply any pending inactivity decay before recording the new outcome so
    // the running score reflects the source's current (decayed) reputation.
    if (record) {
      record = await this.decayAndPersist(record);
    }

    const previousScore = record?.reliability_score ?? null;

    if (!record) {
      record = this.reliabilityRepository.create({
        data_source: dataSource,
        total_submissions: 0,
        correct_submissions: 0,
        reliability_score: null,
      });
    }

    record.total_submissions += 1;
    if (wasCorrect) {
      record.correct_submissions += 1;
    }
    record.reliability_score =
      record.correct_submissions / record.total_submissions;

    const saved = await this.reliabilityRepository.save(record);

    // Persist immutable history record for audit trail (#1765)
    const historyRecord = this.historyRepository.create({
      data_source: dataSource,
      match_id: matchId,
      was_correct: wasCorrect,
      previous_score: previousScore,
      new_score: saved.reliability_score,
      total_submissions: saved.total_submissions,
      correct_submissions: saved.correct_submissions,
    } as any);
    await this.historyRepository.save(historyRecord);

    this.logger.log(
      `Reliability updated: source=${dataSource}, match_id=${matchId}, was_correct=${wasCorrect}, score=${saved.reliability_score?.toFixed(4)}, total=${saved.total_submissions}`,
    );

    return saved;
  }

  async getScores(): Promise<ReliabilityScoreResponse[]> {
    const records = await this.reliabilityRepository.find({
      order: { reliability_score: 'DESC' },
    });
    const decayed = await Promise.all(
      records.map((r) => this.decayAndPersist(r)),
    );
    return decayed
      .sort(
        (a, b) =>
          (b.reliability_score ?? -1) - (a.reliability_score ?? -1),
      )
      .map((r) => this.toResponse(r));
  }

  async getScoreBySource(
    dataSource: string,
  ): Promise<ReliabilityScoreResponse | null> {
    const record = await this.reliabilityRepository.findOne({
      where: { data_source: dataSource },
    });
    if (!record) {
      return null;
    }
    const decayed = await this.decayAndPersist(record);
    return this.toResponse(decayed);
  }

  /**
   * Get reliability score history for a data source, optionally filtered by match.
   * Used for auditing and reconstructing historical consensus decisions.
   */
  async getScoreHistory(dataSource: string, limit = 100) {
    return this.historyRepository.find({
      where: { data_source: dataSource },
      order: { created_at: 'DESC' },
      take: limit,
    });
  }

  /**
   * Returns a weight for a source in [WEIGHT_FLOOR, 1.0].
   *
   * Weight is based on the oracle's historical reliability score:
   * - No history: DEFAULT_WEIGHT (neutral, equally weighted)
   * - With history: reliability_score (bounded in [0, 1])
   *
   * The result is always clamped to at least WEIGHT_FLOOR, so a source with a
   * poor accuracy history (or a zero reliability score) still participates in
   * consensus rather than being excluded entirely.
   *
   * @param dataSource The oracle source identifier
   * @returns Weight in the range [WEIGHT_FLOOR, 1.0]
   */
  async getWeight(dataSource: string): Promise<number> {
    const record = await this.reliabilityRepository.findOne({
      where: { data_source: dataSource },
    });
    const decayed = record ? await this.decayAndPersist(record) : null;
    const weight = decayed?.reliability_score ?? this.DEFAULT_WEIGHT;
    // Clamp to [WEIGHT_FLOOR, 1.0]
    return Math.max(this.WEIGHT_FLOOR, Math.min(1.0, weight));
  }

  /**
   * Get the configured weight floor. Used by consensus logic to ensure
   * minimum participation requirements.
   */
  getWeightFloor(): number {
    return this.WEIGHT_FLOOR;
  }

  /**
   * Get the default weight for sources with no history.
   */
  getDefaultWeight(): number {
    return this.DEFAULT_WEIGHT;
  }

  private toResponse(r: OracleSourceReliability): ReliabilityScoreResponse {
    return {
      data_source: r.data_source,
      total_submissions: r.total_submissions,
      correct_submissions: r.correct_submissions,
      reliability_score: r.reliability_score,
      updated_at: r.updated_at.toISOString(),
    };
  }
}
