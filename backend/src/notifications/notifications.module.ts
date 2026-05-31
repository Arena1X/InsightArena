import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notification } from './entities/notification.entity';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { EmailService } from './email.service';
import { NotificationGeneratorService } from './notification-generator.service';
import { UsersModule } from '../users/users.module';
import { User } from '../users/entities/user.entity';
import { UserPreferences } from '../users/entities/user-preferences.entity';
import { CreatorEvent } from '../matches/entities/creator-event.entity';
import { Match } from '../matches/entities/match.entity';
import { MatchPrediction } from '../matches/entities/match-prediction.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Notification,
      User,
      UserPreferences,
      CreatorEvent,
      Match,
      MatchPrediction,
    ]),
    UsersModule,
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService, EmailService, NotificationGeneratorService],
  exports: [NotificationsService, EmailService, NotificationGeneratorService],
})
export class NotificationsModule {}
