import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActivityLog } from '../analytics/entities/activity-log.entity';
import { CompetitionParticipant } from '../competitions/entities/competition-participant.entity';
import { Competition } from '../competitions/entities/competition.entity';
import { FlagsModule } from '../flags/flags.module';
import { Comment } from '../markets/entities/comment.entity';
import { Market } from '../markets/entities/market.entity';
import { MarketsModule } from '../markets/markets.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { Prediction } from '../predictions/entities/prediction.entity';
import { User } from '../users/entities/user.entity';
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
    ]),
    FlagsModule,
    NotificationsModule,
  ],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
