import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { Prediction } from '../predictions/entities/prediction.entity';
import { CompetitionParticipant } from '../competitions/entities/competition-participant.entity';
import { Market } from '../markets/entities/market.entity';
import { LeaderboardEntry } from '../leaderboard/entities/leaderboard-entry.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Prediction,
      CompetitionParticipant,
      Market,
      LeaderboardEntry,
    ]),
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
