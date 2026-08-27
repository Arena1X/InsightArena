import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { MatchesController } from './matches.controller';
import { MatchesService } from './matches.service';
import { CreatorEventFinalizerService } from './creator-event-finalizer.service';
import { Match } from './entities/match.entity';
import { MatchPrediction } from './entities/match-prediction.entity';
import { CreatorEvent } from './entities/creator-event.entity';
import { SorobanModule } from '../soroban/soroban.module';
import { HttpModule } from '@nestjs/axios';
import { ExternalMatchResult } from './entities/external-match-result.entity';
import { MatchResultDivergence } from './entities/match-result-divergence.entity';
import { ExternalResultIngestionService } from './external-result-ingestion.service';
import {
  EXTERNAL_RESULT_FEED_CLIENT,
  HttpExternalResultFeedClient,
} from './external-result-feed.client';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Match,
      MatchPrediction,
      CreatorEvent,
      ExternalMatchResult,
      MatchResultDivergence,
    ]),
    HttpModule,
    ScheduleModule.forRoot(),
    SorobanModule,
    NotificationsModule,
  ],
  controllers: [MatchesController],
  providers: [
    MatchesService,
    CreatorEventFinalizerService,
    ExternalResultIngestionService,
    HttpExternalResultFeedClient,
    {
      provide: EXTERNAL_RESULT_FEED_CLIENT,
      useExisting: HttpExternalResultFeedClient,
    },
  ],
  exports: [MatchesService, TypeOrmModule],
})
export class MatchesModule {}
