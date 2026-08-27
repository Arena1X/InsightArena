import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActivityLog } from '../analytics/entities/activity-log.entity';
import { Flag } from '../flags/entities/flag.entity';
import { AnalyticsModule } from '../analytics/analytics.module';
import { CompetitionParticipant } from '../competitions/entities/competition-participant.entity';
import { Competition } from '../competitions/entities/competition.entity';
import { FlagsModule } from '../flags/flags.module';
import { FeeHistory } from '../indexer/entities/fee-history.entity';
import { Comment } from '../markets/entities/comment.entity';
import { Market } from '../markets/entities/market.entity';
import { CreatorEvent } from '../matches/entities/creator-event.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { MarketsModule } from '../markets/markets.module';
import { Prediction } from '../predictions/entities/prediction.entity';
import { PredictionsModule } from '../predictions/predictions.module';
import { User } from '../users/entities/user.entity';
import { UserFlag } from './entities/user-flag.entity';
import { VerifiedAddress } from './entities/verified-address.entity';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Market,
      Comment,
      Prediction,
      Competition,
      CompetitionParticipant,
      ActivityLog,
      Flag,
      CreatorEvent,
      VerifiedAddress,
      FeeHistory,
      UserFlag,
    ]),
    AnalyticsModule,
    FlagsModule,
    NotificationsModule,
    MarketsModule,
    PredictionsModule,
    CacheModule.register(),
  ],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
