import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Competition } from './entities/competition.entity';
import { CompetitionParticipant } from './entities/competition-participant.entity';
import { CompetitionBracket } from './entities/competition-bracket.entity';
import { BracketRound } from './entities/bracket-round.entity';
import { BracketMatchup } from './entities/bracket-matchup.entity';
import { CompetitionsService } from './competitions.service';
import { CompetitionsController } from './competitions.controller';
import { UsersModule } from '../users/users.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Competition,
      CompetitionParticipant,
      CompetitionBracket,
      BracketRound,
      BracketMatchup,
    ]),
    UsersModule,
    NotificationsModule,
  ],
  controllers: [CompetitionsController],
  providers: [CompetitionsService],
  exports: [CompetitionsService],
})
export class CompetitionsModule {}
