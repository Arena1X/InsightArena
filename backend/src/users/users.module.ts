import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { UserPreferences } from './entities/user-preferences.entity';
import { UserFollow } from './entities/user-follow.entity';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { Prediction } from '../predictions/entities/prediction.entity';
import { CompetitionParticipant } from '../competitions/entities/competition-participant.entity';
import { Market } from '../markets/entities/market.entity';
import { Notification } from '../notifications/entities/notification.entity';
import { UserBookmark } from '../markets/entities/user-bookmark.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      UserPreferences,
      UserFollow,
      Prediction,
      CompetitionParticipant,
      Market,
      Notification,
      UserBookmark,
    ]),
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
