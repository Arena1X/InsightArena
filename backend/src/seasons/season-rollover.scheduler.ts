import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SeasonsService } from './seasons.service';

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
}
