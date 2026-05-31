import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreatorEventMatch } from '../creator-events/entities/creator-event-match.entity';
import {
  WebhookMatchResultDto,
  WebhookResponseDto,
  WinningTeam,
} from './dto/webhook-match-result.dto';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  OracleSubmission,
  SubmissionStatus,
} from './entities/oracle-submission.entity';

interface QueuedSubmission {
  id: string;
  matchId: string;
  winningTeam: WinningTeam;
  confidenceScore: number;
  dataSource: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
  retryCount: number;
  createdAt: Date;
  nextRetryAt: Date;
  lastError?: string;
}

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);
  private readonly submissionQueue: Map<string, QueuedSubmission> = new Map();
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAYS = [60000, 300000, 900000]; // 1min, 5min, 15min

  constructor(
    @InjectRepository(CreatorEventMatch)
    private readonly matchRepository: Repository<CreatorEventMatch>,
    @InjectRepository(OracleSubmission)
    private readonly submissionRepository: Repository<OracleSubmission>,
    private readonly configService: ConfigService,
  ) {
    this.startRetryProcessor();
  }

  async processMatchResult(
    dto: WebhookMatchResultDto,
  ): Promise<WebhookResponseDto> {
    const jobId = this.generateJobId();

    // Validate match exists
    const match = await this.matchRepository.findOne({
      where: { on_chain_match_id: dto.match_id },
    });

    if (!match) {
      throw new NotFoundException(`Match with ID ${dto.match_id} not found`);
    }

    // Validate match hasn't been resolved
    if (match.result_submitted) {
      throw new ConflictException(
        `Match ${dto.match_id} has already been resolved`,
      );
    }

    // Validate match time has passed (allow 1 hour buffer)
    const matchTime = new Date(match.match_time);
    const now = new Date();
    const timeDiff = now.getTime() - matchTime.getTime();
    const oneHour = 60 * 60 * 1000;

    if (timeDiff < -oneHour) {
      throw new ConflictException(`Match ${dto.match_id} has not started yet`);
    }

    // Queue for submission
    const submission: QueuedSubmission = {
      id: jobId,
      matchId: dto.match_id,
      winningTeam: dto.winning_team,
      confidenceScore: dto.confidence_score,
      dataSource: dto.data_source,
      timestamp: dto.timestamp,
      metadata: dto.metadata,
      retryCount: 0,
      createdAt: new Date(),
      nextRetryAt: new Date(),
    };

    this.submissionQueue.set(jobId, submission);

    // Save to database for history tracking
    await this.saveSubmissionToDatabase(submission, match);

    this.logger.log(
      `Match result queued for submission: job_id=${jobId}, match_id=${dto.match_id}, winning_team=${dto.winning_team}`,
    );

    // Try to submit immediately
    await this.submitToOracle(submission);

    return {
      job_id: jobId,
      status: 'accepted',
      message: 'Match result queued for submission',
    };
  }

  private async submitToOracle(submission: QueuedSubmission): Promise<void> {
    try {
      // In a real implementation, this would submit to the Soroban contract
      // For now, we'll simulate the submission by updating the match record
      this.logger.log(
        `Submitting match result to oracle: job_id=${submission.id}, match_id=${submission.matchId}`,
      );

      // Simulate oracle submission (replace with actual contract call)
      await this.simulateOracleSubmission(submission);

      // Remove from queue on success
      this.submissionQueue.delete(submission.id);

      this.logger.log(
        `Successfully submitted match result: job_id=${submission.id}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to submit match result: job_id=${submission.id}, error=${error instanceof Error ? error.message : 'Unknown'}`,
      );

      // Handle retry logic
      await this.handleRetry(
        submission,
        error instanceof Error ? error.message : 'Unknown error',
      );
    }
  }

  private async simulateOracleSubmission(
    submission: QueuedSubmission,
  ): Promise<void> {
    // This is a placeholder for the actual oracle submission logic
    // In production, this would call the Soroban contract to submit the match result

    const startTime = Date.now();

    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Simulate occasional failure for testing retry logic (10% failure rate)
    if (Math.random() < 0.1) {
      throw new Error('Simulated oracle submission failure');
    }

    // Update match record to reflect submission
    const match = await this.matchRepository.findOne({
      where: { on_chain_match_id: submission.matchId },
    });

    if (match) {
      match.result_submitted = true;
      match.winning_team = submission.winningTeam;
      await this.matchRepository.save(match);
    }

    const submissionTime = Date.now() - startTime;

    // Update submission record in database
    await this.updateSubmissionRecord(submission.id, {
      status: SubmissionStatus.SUBMITTED,
      submitted_at: new Date(),
      transaction_hash: `tx_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
      submission_time_ms: submissionTime,
      retry_count: submission.retryCount,
    });
  }

  private async handleRetry(
    submission: QueuedSubmission,
    error: string,
  ): Promise<void> {
    submission.retryCount++;
    submission.lastError = error;

    // Update submission record with error
    await this.updateSubmissionRecord(submission.id, {
      status: SubmissionStatus.FAILED,
      error_message: error,
      retry_count: submission.retryCount,
    });

    if (submission.retryCount >= this.MAX_RETRIES) {
      this.logger.error(
        `Max retries exceeded for job_id=${submission.id}, removing from queue`,
      );
      this.submissionQueue.delete(submission.id);
      return;
    }

    // Calculate next retry time
    const delay =
      this.RETRY_DELAYS[submission.retryCount - 1] ||
      this.RETRY_DELAYS[this.RETRY_DELAYS.length - 1];
    submission.nextRetryAt = new Date(Date.now() + delay);

    this.logger.log(
      `Scheduling retry for job_id=${submission.id}, attempt=${submission.retryCount}/${this.MAX_RETRIES}, next_retry_at=${submission.nextRetryAt.toISOString()}`,
    );
  }

  @Cron(CronExpression.EVERY_MINUTE)
  private async processRetries(): Promise<void> {
    const now = new Date();
    const jobsToRetry: QueuedSubmission[] = [];

    for (const [, submission] of this.submissionQueue.entries()) {
      if (submission.nextRetryAt <= now) {
        jobsToRetry.push(submission);
      }
    }

    if (jobsToRetry.length === 0) {
      return;
    }

    this.logger.log(`Processing ${jobsToRetry.length} retry attempts`);

    for (const submission of jobsToRetry) {
      await this.submitToOracle(submission);
    }
  }

  private startRetryProcessor(): void {
    this.logger.log('Webhook retry processor started');
  }

  private async saveSubmissionToDatabase(
    submission: QueuedSubmission,
    match: CreatorEventMatch,
  ): Promise<void> {
    try {
      const dbSubmission = this.submissionRepository.create({
        match_id: submission.matchId,
        team_a: match.team_a,
        team_b: match.team_b,
        winning_team: submission.winningTeam,
        confidence_score: submission.confidenceScore,
        data_source: submission.dataSource,
        result_timestamp: new Date(submission.timestamp),
        metadata: submission.metadata,
        status: SubmissionStatus.PENDING,
        retry_count: 0,
      });

      await this.submissionRepository.save(dbSubmission);
      this.logger.log(`Submission saved to database: job_id=${submission.id}`);
    } catch (error) {
      this.logger.error(
        `Failed to save submission to database: ${error instanceof Error ? error.message : 'Unknown'}`,
      );
    }
  }

  private async updateSubmissionRecord(
    jobId: string,
    updates: Partial<OracleSubmission>,
  ): Promise<void> {
    try {
      const submission = await this.submissionRepository.findOne({
        where: { match_id: jobId.replace('job_', '').split('_')[0] },
      });

      if (submission) {
        Object.assign(submission, updates);
        await this.submissionRepository.save(submission);
      }
    } catch (error) {
      this.logger.error(
        `Failed to update submission record: ${error instanceof Error ? error.message : 'Unknown'}`,
      );
    }
  }

  private generateJobId(): string {
    return `job_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  getQueueStatus(): {
    total: number;
    pending: number;
    retrying: number;
    jobs: Array<{
      id: string;
      matchId: string;
      retryCount: number;
      nextRetryAt: Date;
      lastError?: string;
    }>;
  } {
    const jobs = Array.from(this.submissionQueue.values()).map((job) => ({
      id: job.id,
      matchId: job.matchId,
      retryCount: job.retryCount,
      nextRetryAt: job.nextRetryAt,
      lastError: job.lastError,
    }));

    const pending = jobs.filter((j) => j.retryCount === 0).length;
    const retrying = jobs.filter((j) => j.retryCount > 0).length;

    return {
      total: jobs.length,
      pending,
      retrying,
      jobs,
    };
  }

  getJobStatus(jobId: string): QueuedSubmission | null {
    return this.submissionQueue.get(jobId) || null;
  }
}
