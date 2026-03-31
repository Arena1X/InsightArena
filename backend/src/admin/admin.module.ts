import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity';
import { Market } from '../markets/entities/market.entity';
import { Comment } from '../markets/entities/comment.entity';
import { Prediction } from '../predictions/entities/prediction.entity';
import { Competition } from '../competitions/entities/competition.entity';
import { CompetitionParticipant } from '../competitions/entities/competition-participant.entity';
import { ActivityLog } from '../analytics/entities/activity-log.entity';
import { NotificationsModule } from '../notifications/notifications.module';
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
    NotificationsModule,
  ],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
