import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SeasonRolloverResult, SeasonsService } from './seasons.service';

@Injectable()
export class SeasonRolloverScheduler {
  private readonly logger = new Logger(SeasonRolloverScheduler.name);
  private running = false;

  constructor(private readonly seasonsService: SeasonsService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handleRolloverTick(): Promise<void> {
    if (this.running) {
      this.logger.debug('Season rollover already in progress; skipping tick');
      return;
    }

    this.running = true;
    try {
      const result = await this.seasonsService.processSeasonRollover();
      if (!result.skipped) {
        this.logger.log(
          `Season rollover tick: closed=${result.closedSeasonId} opened=${result.openedSeasonId}`,
        );
      }
    } catch (err) {
      this.logger.error('Season rollover tick failed', err);
    } finally {
      this.running = false;
    }
  }

  /**
   * Previews the rollover that would run at `now` without persisting anything,
   * and logs a summary of the planned changes.
   */
  async previewRollover(now = new Date()): Promise<SeasonRolloverResult> {
    const result = await this.seasonsService.processSeasonRollover(now, {
      dryRun: true,
    });
    const plan = result.plan;

    if (!plan || result.skipped) {
      this.logger.log('Season rollover dry run: nothing to roll over');
      return result;
    }

    this.logger.log(
      `Season rollover dry run (no changes persisted): ` +
        `close=${plan.closedSeasonNumber ?? 'none'} -> open=${plan.openedSeasonNumber ?? 'none'}; ` +
        `snapshot ${plan.leaderboardSize} standings; ` +
        `reset season_points for ${plan.leaderboardSize} users; ` +
        `top_winner=${plan.topWinnerId ?? 'none'}; ` +
        `pool=${plan.rewardPoolStroops} stroops; ` +
        `rewards_computed=${result.rewardsComputed}`,
    );
    return result;
  }
}
