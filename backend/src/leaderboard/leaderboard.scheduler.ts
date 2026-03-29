import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { LeaderboardService } from './leaderboard.service';

@Injectable()
export class LeaderboardScheduler {
  private readonly logger = new Logger(LeaderboardScheduler.name);

  constructor(private readonly leaderboardService: LeaderboardService) {}

  @Cron('0 */1 * * *')
  async handleHourlyRecalculation(): Promise<void> {
    this.logger.log('Hourly leaderboard recalculation triggered');
    try {
      await this.leaderboardService.recalculateRanks();
    } catch (err) {
      this.logger.error('Leaderboard recalculation failed', err);
    }
  }
}
