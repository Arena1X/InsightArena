import { Injectable, Logger, Optional } from '@nestjs/common';
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

const DEFAULT_MIN_WEIGHT_FLOOR = 0.1;

@Injectable()
export class OracleReliabilityService {
  private readonly logger = new Logger(OracleReliabilityService.name);

  constructor(
    @InjectRepository(OracleSourceReliability)
    private readonly reliabilityRepository: Repository<OracleSourceReliability>,
    @Optional()
    @InjectRepository(OracleReliabilityHistory)
    private readonly historyRepository?: Repository<OracleReliabilityHistory>,
  ) {}

  /**
   * Called when an outcome is finalized. Records whether the source's
   * submission matched the finalized outcome, recomputes the score,
   * and saves an audit entry into score history.
   */
  async recordOutcome(
    dataSource: string,
    wasCorrect: boolean,
    matchId?: string,
  ): Promise<OracleSourceReliability> {
    let record = await this.reliabilityRepository.findOne({
      where: { data_source: dataSource },
    });

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

    if (this.historyRepository) {
      try {
        const historyEntry = this.historyRepository.create({
          data_source: dataSource,
          was_correct: wasCorrect,
          reliability_score: saved.reliability_score ?? 1.0,
          total_submissions: saved.total_submissions,
          correct_submissions: saved.correct_submissions,
          match_id: matchId,
        });
        await this.historyRepository.save(historyEntry);
      } catch (err) {
        this.logger.warn(
          `Failed to record reliability history for ${dataSource}: ${(err as Error).message}`,
        );
      }
    }

    this.logger.log(
      `Reliability updated: source=${dataSource}, score=${saved.reliability_score?.toFixed(4)}, total=${saved.total_submissions}`,
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
   * Returns a weight for a source in [floor, 1.0].
   * Falls back to 1.0 (neutral) when no score exists yet.
   */
  async getWeight(
    dataSource: string,
    minFloor: number = DEFAULT_MIN_WEIGHT_FLOOR,
  ): Promise<number> {
    const record = await this.reliabilityRepository.findOne({
      where: { data_source: dataSource },
    });
    if (!record || record.reliability_score === null) {
      return 1.0;
    }
    return Math.max(minFloor, Math.min(1.0, record.reliability_score));
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
