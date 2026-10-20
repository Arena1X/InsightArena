import { Module, forwardRef } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LeaderboardEntry } from './entities/leaderboard-entry.entity';
import { LeaderboardHistory } from './entities/leaderboard-history.entity';
import { LeaderboardSnapshot } from './entities/leaderboard-snapshot.entity';
import { Prediction } from '../predictions/entities/prediction.entity';
import { UsersModule } from '../users/users.module';
import { SeasonsModule } from '../seasons/seasons.module';
import { LeaderboardService } from './leaderboard.service';
import { LeaderboardScheduler } from './leaderboard.scheduler';
import { LeaderboardController } from './leaderboard.controller';
import { CacheWarmingModule } from '../cache/cache-warming.module';

@Module({
  imports: [
    CacheModule.register(),
    TypeOrmModule.forFeature([
      LeaderboardEntry,
      LeaderboardHistory,
      LeaderboardSnapshot,
      Prediction,
    ]),
    UsersModule,
    SeasonsModule,
    forwardRef(() => CacheWarmingModule),
  ],
  controllers: [LeaderboardController],
  providers: [LeaderboardService, LeaderboardScheduler],
  exports: [LeaderboardService],
})
export class LeaderboardModule {}
