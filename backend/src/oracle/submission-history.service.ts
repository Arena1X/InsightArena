import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual, LessThanOrEqual, And } from 'typeorm';
import {
  OracleSubmission,
  SubmissionStatus,
} from './entities/oracle-submission.entity';
import {
  GetSubmissionsQueryDto,
  PaginatedSubmissionsResponse,
  SubmissionResponse,
  SubmissionStatistics,
} from './dto/submission-history.dto';

@Injectable()
export class SubmissionHistoryService {
  private readonly logger = new Logger(SubmissionHistoryService.name);

  constructor(
    @InjectRepository(OracleSubmission)
    private readonly submissionRepository: Repository<OracleSubmission>,
  ) {}

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
}
