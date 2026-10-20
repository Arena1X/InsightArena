import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { ConfigService } from '@nestjs/config';
import { LeaderboardService } from './leaderboard.service';
import { CacheWarmingService } from '../cache/warming.service';

const SNAPSHOT_JOB_NAME = 'leaderboard-rank-snapshot';

@Injectable()
export class LeaderboardScheduler implements OnModuleInit {
  private readonly logger = new Logger(LeaderboardScheduler.name);

  constructor(
    private readonly leaderboardService: LeaderboardService,
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly configService: ConfigService,
    private readonly cacheWarmingService: CacheWarmingService,
  ) {}

  onModuleInit(): void {
    const cronExpression = this.configService.get<string>(
      'LEADERBOARD_SNAPSHOT_CRON',
      '0 * * * *',
    );

    const job = new CronJob(cronExpression, () =>
      this.handleRankSnapshot().catch((err) =>
        this.logger.error('Leaderboard rank snapshot job failed', err),
      ),
    );

    this.schedulerRegistry.addCronJob(SNAPSHOT_JOB_NAME, job);
    job.start();

    this.logger.log(
      `Leaderboard rank snapshot scheduled with cron "${cronExpression}"`,
    );
  }

  @Cron('0 */1 * * *')
  async handleHourlyRecalculation(): Promise<void> {
    this.logger.log('Hourly leaderboard recalculation triggered');
    try {
      await this.leaderboardService.recalculateRanks();
      await this.cacheWarmingService.warmLeaderboard({
        warmed: [],
        failed: [],
      });
    } catch (err) {
      this.logger.error('Leaderboard recalculation failed', err);
    }
  }

  @Cron('0 0 * * *')
  async handleDailySnapshot(): Promise<void> {
    this.logger.log('Daily leaderboard snapshot triggered');
    try {
      await this.leaderboardService.createDailySnapshot();
    } catch (err) {
      this.logger.error('Daily snapshot failed', err);
    }
  }

  /**
   * Weekly coach insights refresh (Mondays 03:00). Recomputes and re-caches
   * each eligible user's insights under the new ISO-week cache key. Users
   * missed by this job still get on-demand computation at request time.
   */
  @Cron('0 3 * * 1')
  async handleWeeklyCoachInsightsRefresh(): Promise<void> {
    this.logger.log('Weekly coach insights refresh triggered');
    try {
      await this.leaderboardService.refreshWeeklyCoachInsights();
    } catch (err) {
      this.logger.error('Weekly coach insights refresh failed', err);
    }
  }

  /**
   * Persists a rank/score snapshot on the configurable cadence, then prunes
   * snapshots outside the configured retention window.
   */
  async handleRankSnapshot(): Promise<void> {
    this.logger.log('Leaderboard rank snapshot triggered');
    await this.leaderboardService.createRankSnapshot();
    await this.leaderboardService.pruneSnapshots();
  }
}
