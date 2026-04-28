import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LeaderboardEntry } from './entities/leaderboard-entry.entity';
import { LeaderboardHistory } from './entities/leaderboard-history.entity';
import { UsersModule } from '../users/users.module';
import { LeaderboardService } from './leaderboard.service';
import { LeaderboardScheduler } from './leaderboard.scheduler';
import { LeaderboardController } from './leaderboard.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([LeaderboardEntry, LeaderboardHistory]),
    UsersModule,
  ],
  controllers: [LeaderboardController],
  providers: [LeaderboardService, LeaderboardScheduler],
  exports: [LeaderboardService],
})
export class LeaderboardModule {}
