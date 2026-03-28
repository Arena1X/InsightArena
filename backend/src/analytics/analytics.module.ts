import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Market } from '../markets/entities/market.entity';
import { Prediction } from '../predictions/entities/prediction.entity';
import { UsersModule } from '../users/users.module';
import { MarketsModule } from '../markets/markets.module';
import { PredictionsModule } from '../predictions/predictions.module';
import { LeaderboardModule } from '../leaderboard/leaderboard.module';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Market, Prediction]),
    UsersModule,
    MarketsModule,
    PredictionsModule,
    LeaderboardModule,
  ],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
