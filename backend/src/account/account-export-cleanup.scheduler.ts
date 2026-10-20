import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { AccountService } from './account.service';

export const EXPORT_CLEANUP_JOB_NAME = 'account-export-stale-file-cleanup';

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
      const { expired, failed, stuck, orphans } =
        await this.accountService.cleanupExports();
      if (expired + failed + stuck + orphans > 0) {
        this.logger.log(
          `Account export cleanup: expired=${expired} failed=${failed} ` +
            `stuck=${stuck} orphans=${orphans}`,
        );
      }
    } catch (err) {
      this.logger.error('Account export cleanup failed', err);
    } finally {
      this.running = false;
    }
  }
}
