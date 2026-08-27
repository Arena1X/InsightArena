import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Repository,
  MoreThanOrEqual,
  LessThanOrEqual,
  And,
  Not,
} from 'typeorm';
import { ConfigService } from '@nestjs/config';
import {
  OracleSubmission,
  SubmissionStatus,
  SubmissionReviewStatus,
} from './entities/oracle-submission.entity';
import { OracleSubmissionFlag } from './entities/oracle-submission-flag.entity';
import {
  GetSubmissionsQueryDto,
  PaginatedSubmissionsResponse,
  SubmissionResponse,
  SubmissionStatistics,
} from './dto/submission-history.dto';
import {
  AnomalyEvaluation,
  GetFlagsQueryDto,
  PaginatedFlagsResponse,
  FlagResponse,
} from './dto/anomaly-detection.dto';

/**
 * Sentinel deviation recorded when the baseline has zero variance but the
 * observed value differs from the mean (an unambiguous outlier for which the
 * z-score would be infinite). Kept finite so it can be stored and compared.
 */
const ZERO_VARIANCE_DEVIATION = Number.MAX_SAFE_INTEGER;

/** Reason recorded when only the z-score threshold trips. */
const REASON_ZSCORE_EXCEEDED = 'deviation_exceeds_threshold';
/** Reason recorded when only the median-deviation threshold trips (#1611). */
const REASON_MEDIAN_EXCEEDED = 'median_deviation_exceeds_threshold';

@Injectable()
export class SubmissionHistoryService {
  private readonly logger = new Logger(SubmissionHistoryService.name);

  /** z-score beyond which a submission is flagged as an outlier. */
  private readonly anomalyThreshold: number;
  /** Minimum prior submissions per source before a baseline is trusted. */
  private readonly anomalyMinSamples: number;
  /** Max number of most-recent prior submissions used for the baseline. */
  private readonly anomalyWindow: number;
  /** When true, flagged submissions are held for manual review before use. */
  private readonly anomalyHoldEnabled: boolean;
  /**
   * Absolute deviation from the baseline **median** beyond which a submission
   * is flagged as an outlier versus the consensus (#1611).
   */
  private readonly medianDeviationThreshold: number;

  constructor(
    @InjectRepository(OracleSubmission)
    private readonly submissionRepository: Repository<OracleSubmission>,
    @InjectRepository(OracleSubmissionFlag)
    private readonly flagRepository: Repository<OracleSubmissionFlag>,
    private readonly configService: ConfigService,
  ) {
    this.anomalyThreshold = this.readNumberConfig(
      'ORACLE_ANOMALY_THRESHOLD',
      3,
    );
    this.anomalyMinSamples = this.readNumberConfig(
      'ORACLE_ANOMALY_MIN_SAMPLES',
      5,
    );
    this.anomalyWindow = this.readNumberConfig('ORACLE_ANOMALY_WINDOW', 50);
    this.medianDeviationThreshold = this.readNumberConfig(
      'ORACLE_MEDIAN_DEVIATION_THRESHOLD',
      15,
    );
    this.anomalyHoldEnabled =
      this.configService.get<string>('ORACLE_ANOMALY_HOLD') === 'true';
  }

  private readNumberConfig(key: string, fallback: number): number {
    const raw = this.configService.get<string | number>(key);
    if (raw === undefined || raw === null || raw === '') {
      return fallback;
    }
    const parsed = typeof raw === 'number' ? raw : Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  get holdEnabled(): boolean {
    return this.anomalyHoldEnabled;
  }

  async getSubmissions(
    query: GetSubmissionsQueryDto,
  ): Promise<PaginatedSubmissionsResponse> {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const skip = (page - 1) * limit;

    const where = this.buildWhereClause(query);

    const [submissions, total] = await this.submissionRepository.findAndCount({
      where,
      order: { created_at: 'DESC' },
      skip,
      take: limit,
    });

    const statistics = await this.calculateStatistics(where);

    return {
      data: submissions.map((s) => this.mapToResponse(s)),
      total,
      page,
      limit,
      statistics,
    };
  }

  private buildWhereClause(query: GetSubmissionsQueryDto): any {
    const conditions: any[] = [];

    if (query.status) {
      conditions.push({ status: query.status });
    }

    if (query.matchId) {
      conditions.push({ match_id: query.matchId });
    }

    if (query.dateFrom || query.dateTo) {
      const dateCondition: any = {};
      if (query.dateFrom) {
        dateCondition.created_at = MoreThanOrEqual(new Date(query.dateFrom));
      }
      if (query.dateTo) {
        if (dateCondition.created_at) {
          dateCondition.created_at = And(
            MoreThanOrEqual(new Date(query.dateFrom!)),
            LessThanOrEqual(new Date(query.dateTo)),
          );
        } else {
          dateCondition.created_at = LessThanOrEqual(new Date(query.dateTo));
        }
      }
      conditions.push(dateCondition);
    }

    return conditions.length > 0
      ? conditions.length === 1
        ? conditions[0]
        : // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
          And(...conditions)
      : {};
  }

  private async calculateStatistics(where: any): Promise<SubmissionStatistics> {
    const allSubmissions = await this.submissionRepository.find({
      where,
    });

    const total = allSubmissions.length;

    const successful = allSubmissions.filter(
      (s) => s.status === SubmissionStatus.SUBMITTED,
    ).length;

    const failed = allSubmissions.filter(
      (s) => s.status === SubmissionStatus.FAILED,
    ).length;

    const pending = allSubmissions.filter(
      (s) => s.status === SubmissionStatus.PENDING,
    ).length;

    const successRate = total > 0 ? (successful / total) * 100 : 0;

    const successfulSubmissions = allSubmissions.filter(
      (s) => s.status === SubmissionStatus.SUBMITTED && s.submission_time_ms,
    );
    const averageSubmissionTime =
      successfulSubmissions.length > 0
        ? successfulSubmissions.reduce(
            (sum, s) => sum + (s.submission_time_ms || 0),
            0,
          ) / successfulSubmissions.length
        : 0;

    const submissionsByStatus = {
      [SubmissionStatus.PENDING]: pending,
      [SubmissionStatus.SUBMITTED]: successful,
      [SubmissionStatus.FAILED]: failed,
    };

    return {
      total_submissions: total,
      successful_submissions: successful,
      failed_submissions: failed,
      pending_submissions: pending,
      success_rate: Math.round(successRate * 100) / 100,
      average_submission_time_ms: Math.round(averageSubmissionTime),

      submissions_by_status: submissionsByStatus,
    };
  }

  private mapToResponse(submission: OracleSubmission): SubmissionResponse {
    return {
      id: submission.id,
      match_id: submission.match_id,
      team_a: submission.team_a,
      team_b: submission.team_b,
      winning_team: submission.winning_team,
      confidence_score: submission.confidence_score,
      data_source: submission.data_source,
      result_timestamp: submission.result_timestamp.toISOString(),
      metadata: submission.metadata,
      status: submission.status,
      transaction_hash: submission.transaction_hash,
      submitted_at: submission.submitted_at?.toISOString(),
      error_message: submission.error_message,
      retry_count: submission.retry_count,
      submission_time_ms: submission.submission_time_ms
        ? Number(submission.submission_time_ms)
        : undefined,
      is_anomaly: submission.is_anomaly ?? false,
      anomaly_score:
        submission.anomaly_score !== null &&
        submission.anomaly_score !== undefined
          ? Number(submission.anomaly_score)
          : undefined,
      review_status: submission.review_status,
      created_at: submission.created_at.toISOString(),
    };
  }

  async getSubmissionById(id: string): Promise<SubmissionResponse | null> {
    const submission = await this.submissionRepository.findOne({
      where: { id },
    });

    if (!submission) {
      return null;
    }

    return this.mapToResponse(submission);
  }

  // ── Anomaly detection (#1364) ─────────────────────────────────────────────

  /**
   * Evaluate a confidence score against the rolling baseline of its data
   * source's most recent prior submissions.
   *
   * The baseline is computed over up to `ORACLE_ANOMALY_WINDOW` prior
   * submissions for `dataSource`, optionally excluding one submission id (so a
   * just-persisted row does not bias its own baseline). Two thresholds are
   * enforced:
   *
   * 1. A z-score strictly greater than `ORACLE_ANOMALY_THRESHOLD` against the
   *    baseline mean/stddev.
   * 2. An absolute deviation from the baseline **median** strictly greater than
   *    `ORACLE_MEDIAN_DEVIATION_THRESHOLD` (#1611) — submissions that deviate
   *    sharply from consensus are outliers even when the z-score alone would
   *    pass because the source's history is naturally wide or skewed.
   *
   * With fewer than `ORACLE_ANOMALY_MIN_SAMPLES` prior submissions the baseline
   * is not yet trustworthy, so the value is never flagged. When the baseline has
   * zero variance, any different value is an unambiguous outlier and an equal
   * value is not.
   *
   * Pure and side-effect free: it only reads history and returns a verdict.
   */
  async evaluateAnomaly(
    dataSource: string,
    value: number,
    excludeSubmissionId?: string,
  ): Promise<AnomalyEvaluation> {
    const history = await this.submissionRepository.find({
      where: excludeSubmissionId
        ? { data_source: dataSource, id: Not(excludeSubmissionId) }
        : { data_source: dataSource },
      order: { created_at: 'DESC' },
      take: this.anomalyWindow,
    });

    const values = history
      .map((s) => Number(s.confidence_score))
      .filter((v) => Number.isFinite(v));

    const sampleSize = values.length;

    if (sampleSize < this.anomalyMinSamples) {
      return {
        isAnomaly: false,
        zScore: null,
        mean: sampleSize > 0 ? this.mean(values) : 0,
        stddev: 0,
        baselineMedian: sampleSize > 0 ? this.median(values) : 0,
        medianDeviation: null,
        sampleSize,
        threshold: this.anomalyThreshold,
        reason: 'insufficient_samples',
      };
    }

    const mean = this.mean(values);
    const stddev = this.stddev(values, mean);
    const median = this.median(values);
    const medianDeviation = Math.abs(value - median);

    if (stddev === 0) {
      const isAnomaly = value !== mean;
      return {
        isAnomaly,
        zScore: isAnomaly ? ZERO_VARIANCE_DEVIATION : 0,
        mean,
        stddev,
        baselineMedian: median,
        medianDeviation,
        sampleSize,
        threshold: this.anomalyThreshold,
        reason: isAnomaly ? 'zero_variance_outlier' : 'within_threshold',
      };
    }

    const zScore = Math.abs(value - mean) / stddev;
    const zExceeded = zScore > this.anomalyThreshold;
    const medianExceeded = medianDeviation > this.medianDeviationThreshold;
    const isAnomaly = zExceeded || medianExceeded;

    // Prefer reporting the original z-score rule; the median rule gets its own
    // reason when it is the one that tripped.
    const reason = zExceeded
      ? REASON_ZSCORE_EXCEEDED
      : medianExceeded
        ? REASON_MEDIAN_EXCEEDED
        : 'within_threshold';

    return {
      isAnomaly,
      zScore,
      mean,
      stddev,
      baselineMedian: median,
      medianDeviation,
      sampleSize,
      threshold: this.anomalyThreshold,
      reason,
    };
  }

  /**
   * Screen an already-persisted submission for anomalies, record a flag if it
   * is an outlier, and hold it for manual review when holding is enabled.
   *
   * Always stamps `is_anomaly` and `anomaly_score` on the submission for
   * transparency. When flagged: writes an immutable {@link OracleSubmissionFlag}
   * audit row and, if `ORACLE_ANOMALY_HOLD=true`, sets the submission's
   * `review_status` to `HELD`. Returns whether the caller should withhold the
   * submission from on-chain use.
   */
  async screenSubmission(submission: OracleSubmission): Promise<{
    flagged: boolean;
    held: boolean;
    evaluation: AnomalyEvaluation;
  }> {
    const evaluation = await this.evaluateAnomaly(
      submission.data_source,
      Number(submission.confidence_score),
      submission.id,
    );

    const held = evaluation.isAnomaly && this.anomalyHoldEnabled;

    submission.is_anomaly = evaluation.isAnomaly;
    submission.anomaly_score = evaluation.zScore ?? undefined;
    submission.review_status = held
      ? SubmissionReviewStatus.HELD
      : (submission.review_status ?? SubmissionReviewStatus.NOT_REQUIRED);
    await this.submissionRepository.save(submission);

    if (evaluation.isAnomaly) {
      const medianBasis =
        evaluation.medianDeviation !== null &&
        evaluation.medianDeviation !== undefined
          ? `, ${evaluation.medianDeviation.toFixed(2)} from baseline median ${(evaluation.baselineMedian ?? 0).toFixed(2)} (threshold ${this.medianDeviationThreshold})`
          : '';
      const reason = `confidence ${submission.confidence_score} deviates ${
        evaluation.zScore === ZERO_VARIANCE_DEVIATION
          ? '∞'
          : evaluation.zScore?.toFixed(2)
      }σ from baseline mean ${evaluation.mean.toFixed(2)} (threshold ${
        evaluation.threshold
      })${medianBasis}`;

      const flag = this.flagRepository.create({
        submission_id: submission.id,
        match_id: submission.match_id,
        data_source: submission.data_source,
        observed_value: Number(submission.confidence_score),
        baseline_mean: evaluation.mean,
        baseline_median: evaluation.baselineMedian ?? undefined,
        baseline_stddev: evaluation.stddev,
        deviation: evaluation.zScore ?? 0,
        threshold: evaluation.threshold,
        sample_size: evaluation.sampleSize,
        held,
        reason,
      });
      await this.flagRepository.save(flag);

      this.logger.warn(
        `Oracle submission flagged as anomaly: submission_id=${submission.id}, ` +
          `data_source=${submission.data_source}, ${reason}, held=${held}`,
      );
    }

    return { flagged: evaluation.isAnomaly, held, evaluation };
  }

  /**
   * List recorded anomaly flags for admin review, most recent first.
   */
  async getFlags(query: GetFlagsQueryDto): Promise<PaginatedFlagsResponse> {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (query.dataSource) {
      where.data_source = query.dataSource;
    }
    if (query.matchId) {
      where.match_id = query.matchId;
    }
    if (query.heldOnly) {
      where.held = true;
    }

    const [flags, total] = await this.flagRepository.findAndCount({
      where,
      order: { created_at: 'DESC' },
      skip,
      take: limit,
    });

    return {
      data: flags.map((f) => this.mapFlagToResponse(f)),
      total,
      page,
      limit,
    };
  }

  private mapFlagToResponse(flag: OracleSubmissionFlag): FlagResponse {
    return {
      id: flag.id,
      submission_id: flag.submission_id,
      match_id: flag.match_id,
      data_source: flag.data_source,
      observed_value: Number(flag.observed_value),
      baseline_mean: Number(flag.baseline_mean),
      baseline_median:
        flag.baseline_median !== null && flag.baseline_median !== undefined
          ? Number(flag.baseline_median)
          : undefined,
      baseline_stddev: Number(flag.baseline_stddev),
      deviation: Number(flag.deviation),
      threshold: Number(flag.threshold),
      sample_size: flag.sample_size,
      held: flag.held,
      reason: flag.reason,
      created_at: flag.created_at.toISOString(),
    };
  }

  private mean(values: number[]): number {
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }

  /** Median of an already-collected numeric window. */
  private median(values: number[]): number {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  }

  private stddev(values: number[], mean: number): number {
    const variance =
      values.reduce((sum, v) => sum + (v - mean) * (v - mean), 0) /
      values.length;
    return Math.sqrt(variance);
  }
}
