import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
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
   * Minimum weight floor: a single oracle with perfect historical accuracy
   * cannot unilaterally decide consensus. Even a 1.0-reliability oracle
   * must be one voice in the final outcome. This prevents single-source
   * centralization.
   */
  private readonly WEIGHT_FLOOR = 0.0;

  /**
   * Newly-seen oracle sources (no submissions yet) default to this neutral
   * weight until their first outcome is recorded. This treats unknown sources
   * equally with the group before history is available.
   */
  private readonly DEFAULT_WEIGHT = 1.0;

  constructor(
    @InjectRepository(OracleSourceReliability)
    private readonly reliabilityRepository: Repository<OracleSourceReliability>,
    @InjectRepository(OracleReliabilityHistory)
    private readonly historyRepository: Repository<OracleReliabilityHistory>,
  ) {}

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
    return records.map((r) => this.toResponse(r));
  }

  async getScoreBySource(
    dataSource: string,
  ): Promise<ReliabilityScoreResponse | null> {
    const record = await this.reliabilityRepository.findOne({
      where: { data_source: dataSource },
    });
    return record ? this.toResponse(record) : null;
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
   * Weights are normalized by consumers to ensure one oracle cannot
   * unilaterally decide an outcome when weight_floor is applied.
   *
   * @param dataSource The oracle source identifier
   * @returns Weight in the range [WEIGHT_FLOOR, 1.0]
   */
  async getWeight(dataSource: string): Promise<number> {
    const record = await this.reliabilityRepository.findOne({
      where: { data_source: dataSource },
    });
    const weight = record?.reliability_score ?? this.DEFAULT_WEIGHT;
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
