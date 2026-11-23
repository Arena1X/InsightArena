import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { AccountService, ExportCleanupResult } from './account.service';

export const EXPORT_CLEANUP_JOB_NAME = 'account-export-stale-file-cleanup';
const REPEATED_DELETION_FAILURE_RUNS = 3;

export interface ExportCleanupRunSummary extends ExportCleanupResult {
  completedAt: Date;
  error?: string;
}

/**
 * Schedules periodic removal of stale account export files and job rows on
 * the cadence given by EXPORT_CLEANUP_CRON. Runs never overlap: a tick that
 * fires while the previous run is still in progress is skipped.
 */
@Injectable()
export class AccountExportCleanupScheduler
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(AccountExportCleanupScheduler.name);
  private running = false;
  private consecutiveDeletionFailureRuns = 0;
  private latestRunSummary: ExportCleanupRunSummary | null = null;

  constructor(
    private readonly accountService: AccountService,
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit(): void {
    const enabled =
      String(
        this.configService.get<string>('EXPORT_CLEANUP_ENABLED', 'true'),
      ).toLowerCase() !== 'false';
    if (!enabled) {
      this.logger.log('Account export cleanup is disabled');
      return;
    }

    const cronExpression = this.configService.get<string>(
      'EXPORT_CLEANUP_CRON',
      '0 * * * *',
    );

    const job = new CronJob(cronExpression, () => {
      void this.handleCleanup();
    });

    this.schedulerRegistry.addCronJob(EXPORT_CLEANUP_JOB_NAME, job);
    job.start();

    this.logger.log(
      `Account export cleanup scheduled with cron "${cronExpression}"`,
    );
  }

  onModuleDestroy(): void {
    if (this.schedulerRegistry.doesExist('cron', EXPORT_CLEANUP_JOB_NAME)) {
      this.schedulerRegistry.deleteCronJob(EXPORT_CLEANUP_JOB_NAME);
    }
  }

  async handleCleanup(): Promise<void> {
    if (this.running) {
      this.logger.warn(
        'Previous account export cleanup still running; skipping this tick',
      );
      return;
    }

    this.running = true;
    try {
      const result = await this.accountService.cleanupExports();
      this.latestRunSummary = {
        ...result,
        completedAt: new Date(),
      };

      if (
        result.expired +
          result.failed +
          result.stuck +
          result.orphans +
          result.filesScanned +
          result.filesDeleted +
          result.deletionFailures >
        0
      ) {
        this.logger.log(
          `Account export cleanup: scanned=${result.filesScanned} ` +
            `deleted=${result.filesDeleted} bytesReclaimed=${result.bytesReclaimed} ` +
            `deletionFailures=${result.deletionFailures} expired=${result.expired} ` +
            `failed=${result.failed} stuck=${result.stuck} orphans=${result.orphans}`,
        );
      }

      this.recordDeletionFailures(result.deletionFailures);
    } catch (err) {
      this.latestRunSummary = {
        expired: 0,
        failed: 0,
        stuck: 0,
        orphans: 0,
        filesScanned: 0,
        filesDeleted: 0,
        bytesReclaimed: 0,
        deletionFailures: 0,
        completedAt: new Date(),
        error: err instanceof Error ? err.message : String(err),
      };
      this.logger.error('Account export cleanup failed', err);
      this.consecutiveDeletionFailureRuns = 0;
    } finally {
      this.running = false;
    }
  }

  getLatestRunSummary(): ExportCleanupRunSummary | null {
    return this.latestRunSummary;
  }

  private recordDeletionFailures(failureCount: number): void {
    if (failureCount === 0) {
      this.consecutiveDeletionFailureRuns = 0;
      return;
    }

    this.consecutiveDeletionFailureRuns++;
    if (this.consecutiveDeletionFailureRuns === REPEATED_DELETION_FAILURE_RUNS) {
      this.logger.warn(
        `Account export file deletions failed for ${this.consecutiveDeletionFailureRuns} consecutive cleanup runs`,
      );
    }
  }
}
