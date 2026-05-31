import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { CreatorEventMatch } from '../creator-events/entities/creator-event-match.entity';
import { CreatorEvent } from '../creator-events/entities/creator-event.entity';
import { OracleService } from './oracle.service';
import { OracleController } from './oracle.controller';
import { WebhookService } from './webhook.service';
import { WebhookAuthGuard } from './guards/webhook-auth.guard';
import { SubmissionHistoryService } from './submission-history.service';
import { OracleSubmission } from './entities/oracle-submission.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CreatorEventMatch,
      CreatorEvent,
      OracleSubmission,
    ]),
    ScheduleModule.forRoot(),
  ],
  controllers: [OracleController],
  providers: [
    OracleService,
    WebhookService,
    WebhookAuthGuard,
    SubmissionHistoryService,
  ],
  exports: [OracleService, WebhookService, SubmissionHistoryService],
})
export class OracleModule {}
