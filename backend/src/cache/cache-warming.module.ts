import { CacheModule } from '@nestjs/cache-manager';
import { Module, forwardRef } from '@nestjs/common';
import { AnalyticsModule } from '../analytics/analytics.module';
import { MarketsModule } from '../markets/markets.module';
import { LeaderboardModule } from '../leaderboard/leaderboard.module';
import { CacheWarmingService } from './warming.service';

@Module({
  imports: [
    CacheModule.register(),
    MarketsModule,
    AnalyticsModule,
    forwardRef(() => LeaderboardModule),
  ],
  providers: [CacheWarmingService],
  exports: [CacheWarmingService],
})
export class CacheWarmingModule {}
